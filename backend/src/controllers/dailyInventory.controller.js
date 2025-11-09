import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { DailyInventoryEntry } from "../models/inventory/dailyInventoryEntry.model.js";
import { DayStatus } from "../models/inventory/dayStatus.model.js";
import { InventoryItem } from "../models/inventory/inventoryItem.model.js";

// Helper function to get today's date at midnight
const getTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

// Helper function to format date to YYYY-MM-DD
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

// Get today's inventory entries
const getTodayInventory = asyncHandler(async (req, res) => {
    const today = getTodayDate();
    
    const entries = await DailyInventoryEntry.find({ date: today })
        .populate('inventoryItem')
        .populate('addedBy', 'fullname email')
        .sort({ createdAt: -1 });

    // Get day status
    const dayStatus = await DayStatus.findOne({ date: today });

    return res.status(200).json(
        new apiResponse(200, {
            entries,
            date: formatDate(today),
            isDayEnded: dayStatus?.isEnded || false
        }, "Today's inventory retrieved successfully")
    );
});

// Get inventory for a specific date
const getDateInventory = asyncHandler(async (req, res) => {
    const { date } = req.params;
    
    if (!date) {
        throw new apiError("Date parameter is required", 400);
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const entries = await DailyInventoryEntry.find({ date: targetDate })
        .populate('inventoryItem')
        .populate('addedBy', 'fullname email')
        .sort({ createdAt: -1 });

    const dayStatus = await DayStatus.findOne({ date: targetDate });

    return res.status(200).json(
        new apiResponse(200, {
            entries,
            date: formatDate(targetDate),
            isDayEnded: dayStatus?.isEnded || false
        }, "Date inventory retrieved successfully")
    );
});

// Add item to today's inventory
const addItemToToday = asyncHandler(async (req, res) => {
    const today = getTodayDate();
    
    // Check if day is ended
    const dayStatus = await DayStatus.findOne({ date: today });
    if (dayStatus?.isEnded) {
        throw new apiError("Cannot add items. The day has been ended.", 400);
    }

    const { inventoryItemId, quantity, cost, expiryDate } = req.body;

    if (!inventoryItemId || !quantity) {
        throw new apiError("Inventory item ID and quantity are required", 400);
    }

    const parsedQuantity = Number(quantity);
    if (Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
        throw new apiError("Quantity must be a positive number", 400);
    }

    // Verify inventory item exists
    const inventoryItem = await InventoryItem.findById(inventoryItemId);
    if (!inventoryItem) {
        throw new apiError("Inventory item not found", 404);
    }

    // Parse cost if provided
    const parsedCost = cost !== undefined && cost !== null && cost !== '' ? Number(cost) : undefined;
    if (parsedCost !== undefined && (Number.isNaN(parsedCost) || parsedCost < 0)) {
        throw new apiError("Cost must be a non-negative number", 400);
    }

    // Parse expiry date if provided
    let finalExpiryDate = null;
    if (expiryDate) {
        finalExpiryDate = new Date(expiryDate);
    }

    // Create daily inventory entry
    const entry = await DailyInventoryEntry.create({
        date: today,
        inventoryItem: inventoryItemId,
        quantity: parsedQuantity,
        remainingQuantity: parsedQuantity,
        cost: parsedCost,
        expiryDate: finalExpiryDate,
        addedBy: req.user._id
    });

    // Update main inventory item's current stock
    await InventoryItem.findByIdAndUpdate(
        inventoryItemId,
        {
            $inc: { currentStock: parsedQuantity, quantity: parsedQuantity },
            lastUpdatedBy: req.user._id
        }
    );

    const populatedEntry = await DailyInventoryEntry.findById(entry._id)
        .populate('inventoryItem')
        .populate('addedBy', 'fullname email');

    return res.status(201).json(
        new apiResponse(201, populatedEntry, "Item added to today's inventory successfully")
    );
});

// Deduct quantity from daily inventory (used when orders are made)
const deductFromDailyInventory = asyncHandler(async (inventoryItemId, quantity, userId) => {
    const today = getTodayDate();
    
    // Find today's entries for this inventory item, ordered by expiry date (FIFO - First In First Out)
    const entries = await DailyInventoryEntry.find({
        date: today,
        inventoryItem: inventoryItemId,
        remainingQuantity: { $gt: 0 }
    }).sort({ expiryDate: 1, createdAt: 1 }); // Use earliest expiry first, then earliest added

    let remainingToDeduct = quantity;

    for (const entry of entries) {
        if (remainingToDeduct <= 0) break;

        // Check if entry is expired
        if (entry.expiryDate && new Date(entry.expiryDate) < new Date()) {
            continue; // Skip expired items
        }

        const deductAmount = Math.min(entry.remainingQuantity, remainingToDeduct);
        entry.remainingQuantity -= deductAmount;
        remainingToDeduct -= deductAmount;
        await entry.save();
    }

    if (remainingToDeduct > 0) {
        throw new apiError(
            `Insufficient stock in daily inventory. Required: ${quantity}, Available: ${quantity - remainingToDeduct}`,
            400
        );
    }

    // Also update main inventory item
    await InventoryItem.findByIdAndUpdate(
        inventoryItemId,
        {
            $inc: { currentStock: -quantity },
            lastUpdatedBy: userId
        }
    );
});

// End the day
const endDay = asyncHandler(async (req, res) => {
    const today = getTodayDate();
    
    // Check if day is already ended
    let dayStatus = await DayStatus.findOne({ date: today });
    if (dayStatus?.isEnded) {
        throw new apiError("The day has already been ended", 400);
    }

    // Create or update day status
    if (!dayStatus) {
        dayStatus = await DayStatus.create({
            date: today,
            isEnded: true,
            endedAt: new Date(),
            endedBy: req.user._id
        });
    } else {
        dayStatus.isEnded = true;
        dayStatus.endedAt = new Date();
        dayStatus.endedBy = req.user._id;
        await dayStatus.save();
    }

    return res.status(200).json(
        new apiResponse(200, { date: formatDate(today), isEnded: true }, "Day ended successfully")
    );
});

// Start new day (carry forward non-expired items from yesterday)
const startNewDay = asyncHandler(async (req, res) => {
    const today = getTodayDate();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Check if today is already started
    const todayStatus = await DayStatus.findOne({ date: today });
    if (todayStatus?.isEnded) {
        throw new apiError("Today's day has already been ended. Cannot start a new day.", 400);
    }

    // Check if yesterday was ended
    const yesterdayStatus = await DayStatus.findOne({ date: yesterday });
    if (!yesterdayStatus?.isEnded) {
        throw new apiError("Yesterday's day must be ended before starting a new day", 400);
    }

    // Get yesterday's entries with remaining quantity
    const yesterdayEntries = await DailyInventoryEntry.find({
        date: yesterday,
        remainingQuantity: { $gt: 0 }
    }).populate('inventoryItem');

    const now = new Date();
    const carriedForward = [];

    // Carry forward non-expired items
    for (const entry of yesterdayEntries) {
        // Check if expired
        if (entry.expiryDate && new Date(entry.expiryDate) < now) {
            continue; // Skip expired items
        }

        // Create new entry for today with remaining quantity
        const newEntry = await DailyInventoryEntry.create({
            date: today,
            inventoryItem: entry.inventoryItem._id,
            quantity: entry.remainingQuantity,
            remainingQuantity: entry.remainingQuantity,
            cost: entry.cost,
            expiryDate: entry.expiryDate,
            addedBy: req.user._id
        });

        carriedForward.push({
            itemName: entry.inventoryItem.name,
            quantity: entry.remainingQuantity,
            unit: entry.inventoryItem.unit
        });
    }

    return res.status(200).json(
        new apiResponse(200, {
            date: formatDate(today),
            carriedForwardCount: carriedForward.length,
            carriedForward
        }, "New day started successfully. Non-expired items carried forward from yesterday.")
    );
});

// Get day status
const getDayStatus = asyncHandler(async (req, res) => {
    const today = getTodayDate();
    
    const dayStatus = await DayStatus.findOne({ date: today });

    return res.status(200).json(
        new apiResponse(200, {
            date: formatDate(today),
            isDayEnded: dayStatus?.isEnded || false,
            endedAt: dayStatus?.endedAt || null
        }, "Day status retrieved successfully")
    );
});

// Get available items for today (items that can be added)
const getAvailableItemsForToday = asyncHandler(async (req, res) => {
    // Get all inventory items (generalized items)
    const items = await InventoryItem.find({})
        .populate('addedBy', 'fullname')
        .sort({ name: 1 });

    return res.status(200).json(
        new apiResponse(200, items, "Available items retrieved successfully")
    );
});

export {
    getTodayInventory,
    getDateInventory,
    addItemToToday,
    deductFromDailyInventory,
    endDay,
    startNewDay,
    getDayStatus,
    getAvailableItemsForToday
};

