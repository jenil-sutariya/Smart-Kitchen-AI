import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { InventoryItem } from "../models/inventory/inventoryItem.model.js";
import { uploadCloudinary } from "../utils/cloudinary.js";
import { calculateExpiryDate, requiresManualExpiryDate, getDefaultExpiryDate } from "../utils/expiryCalculator.js";
import { processExpiredItems, checkExpiredItems } from "../utils/expiredItemsHandler.js";
import { Inventorylog } from "../models/inventory/inventorylog.model.js";
import fs from 'fs';
import path from 'path';

// Get all inventory items
const getAllInventoryItems = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, status, storageCondition, search } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (category) {
        filter.category = category;
    }
    
    if (status) {
        filter.status = status;
    }
    
    if (storageCondition) {
        filter.storageCondition = storageCondition;
    }
    
    if (search) {
        filter.name = { $regex: search, $options: 'i' };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Check and update expired items status (run in background, don't wait)
    checkExpiredItems().catch(err => {
        console.error('Error checking expired items:', err);
    });
    
    // Process expired items and log them as waste (run in background, don't wait)
    // This will automatically create waste logs for expired items
    processExpiredItems().catch(err => {
        console.error('Error processing expired items:', err);
    });

    // Get total count for pagination info
    const total = await InventoryItem.countDocuments(filter);

    // Get items with pagination
    const inventoryItems = await InventoryItem.find(filter)
        .populate('addedBy', 'fullname email role')
        .populate('lastUpdatedBy', 'fullname email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    // Create pagination response object
    const paginatedResponse = {
        docs: inventoryItems,
        totalDocs: total,
        limit: limitNum,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
        nextPage: pageNum < Math.ceil(total / limitNum) ? pageNum + 1 : null,
        prevPage: pageNum > 1 ? pageNum - 1 : null
    };

    return res.status(200).json(
        new apiResponse(200, paginatedResponse, "Inventory items retrieved successfully")
    );
});

// Get single inventory item by ID
const getInventoryItemById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const inventoryItem = await InventoryItem.findById(id)
        .populate('addedBy', 'fullname email role')
        .populate('lastUpdatedBy', 'fullname email role');

    if (!inventoryItem) {
        throw new apiError("Inventory item not found", 404);
    }

    return res.status(200).json(
        new apiResponse(200, inventoryItem, "Inventory item retrieved successfully")
    );
});

// Add new inventory item
const addInventoryItem = asyncHandler(async (req, res) => {
    console.log("=== ADD INVENTORY ITEM DEBUG ===");
    console.log("Request method:", req.method);
    console.log("Request body:", req.body);
    console.log("Request user:", req.user);
    console.log("Request file:", req.file);
    
    const {
        name,
        quantity,
        unit,
        expiryDate,
        storageCondition,
        category,
        supplier,
        cost,
        minThreshold,
        maxThreshold,
        notes,
        freshness
    } = req.body;

    // Handle image upload
    let imageUrl = null;
    if (req.file) {
        try {
            const imageLocalPath = req.file.path;
            const image = await uploadCloudinary(imageLocalPath);
            if (image && image.url) {
                imageUrl = image.url;
            }
        } catch (error) {
            console.warn("Image upload failed:", error.message);
            // Continue without image if upload fails
        }
    }

    // Validate required fields (allow quantity = 0)
    if (!name || quantity === undefined || quantity === null || quantity === '' || !storageCondition || !category) {
        throw new apiError("Name, quantity, storage condition, and category are required", 400);
    }

    // Validate numeric fields
    const parsedQuantity = Number(quantity);
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
        throw new apiError("Quantity must be a non-negative number", 400);
    }

    const parsedCost = cost !== undefined && cost !== null && cost !== '' ? Number(cost) : undefined;
    if (parsedCost !== undefined && (Number.isNaN(parsedCost) || parsedCost < 0)) {
        throw new apiError("Cost must be a non-negative number", 400);
    }

    const parsedMinThreshold = minThreshold !== undefined && minThreshold !== null && minThreshold !== '' ? Number(minThreshold) : undefined;
    if (parsedMinThreshold !== undefined && (Number.isNaN(parsedMinThreshold) || parsedMinThreshold < 0)) {
        throw new apiError("Minimum threshold must be a non-negative number", 400);
    }

    const parsedMaxThreshold = maxThreshold !== undefined && maxThreshold !== null && maxThreshold !== '' ? Number(maxThreshold) : undefined;
    if (parsedMaxThreshold !== undefined && (Number.isNaN(parsedMaxThreshold) || parsedMaxThreshold < 0)) {
        throw new apiError("Maximum threshold must be a non-negative number", 400);
    }

    // Calculate expiry date based on category and freshness
    let finalExpiryDate = null;
    
    if (expiryDate) {
        // Manual expiry date provided
        finalExpiryDate = new Date(expiryDate);
    } else {
        // Automatic expiry date calculation
        if (requiresManualExpiryDate(category)) {
            // For dairy and other items, use default expiry date
            finalExpiryDate = getDefaultExpiryDate(category);
        } else {
            // For vegetables, fruits, etc., calculate based on freshness
            finalExpiryDate = calculateExpiryDate(category, freshness);
        }
    }

    // Check if item already exists with same name and category
    const existingItem = await InventoryItem.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        category
    });

    if (existingItem) {
        throw new apiError("Item with this name and category already exists", 409);
    }

    // Use a default user ID if req.user._id is not available
    const addedBy = req.user?._id || "mock-user-id";

    let inventoryItem;
    try {
        console.log("=== CREATING INVENTORY ITEM ===");
        console.log("Data to create:", {
            name,
            quantity: parsedQuantity,
            unit: unit || 'pcs',
            expiryDate: finalExpiryDate,
            storageCondition,
            category,
            supplier,
            cost: parsedCost,
            minThreshold: parsedMinThreshold,
            maxThreshold: parsedMaxThreshold,
            notes,
            image: imageUrl,
            addedBy: addedBy,
            freshness
        });
        
        inventoryItem = await InventoryItem.create({
            name,
            quantity: parsedQuantity,
            unit: unit || 'pcs',
            expiryDate: finalExpiryDate,
            storageCondition,
            category,
            supplier,
            cost: parsedCost,
            minThreshold: parsedMinThreshold,
            maxThreshold: parsedMaxThreshold,
            notes,
            image: imageUrl,
            addedBy: addedBy
        });
        console.log("✅ Inventory item created successfully:", inventoryItem);
    } catch (error) {
        console.error("❌ Error creating inventory item:", error);
        console.error("Error details:", {
            message: error.message,
            name: error.name,
            code: error.code,
            stack: error.stack
        });
        throw error;
    }

    const createdItem = await InventoryItem.findById(inventoryItem._id)
        .populate('addedBy', 'fullname email role');

    return res.status(201).json(
        new apiResponse(201, createdItem, "Inventory item added successfully")
    );
});

// Update inventory item
const updateInventoryItem = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Handle image upload
    if (req.file) {
        const imageLocalPath = req.file.path;
        const image = await uploadCloudinary(imageLocalPath);
        if (image && image.url) {
            updateData.image = image.url;
        }
    }

    const inventoryItem = await InventoryItem.findById(id);

    if (!inventoryItem) {
        throw new apiError("Inventory item not found", 404);
    }

    // Check if updating name and category combination already exists
    if (updateData.name && updateData.category) {
        const existingItem = await InventoryItem.findOne({
            name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
            category: updateData.category,
            _id: { $ne: id }
        });

        if (existingItem) {
            throw new apiError("Item with this name and category already exists", 409);
        }
    }

    // Handle expiry date calculation for updates
    if (updateData.expiryDate) {
        // Manual expiry date provided
        updateData.expiryDate = new Date(updateData.expiryDate);
    } else if (updateData.category && updateData.freshness) {
        // Automatic expiry date calculation for updates
        if (requiresManualExpiryDate(updateData.category)) {
            updateData.expiryDate = getDefaultExpiryDate(updateData.category);
        } else {
            updateData.expiryDate = calculateExpiryDate(updateData.category, updateData.freshness);
        }
    }

    // Add lastUpdatedBy
    updateData.lastUpdatedBy = req.user._id;

    const updatedItem = await InventoryItem.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).populate('addedBy', 'fullname email role')
     .populate('lastUpdatedBy', 'fullname email role');

    return res.status(200).json(
        new apiResponse(200, updatedItem, "Inventory item updated successfully")
    );
});

// Delete inventory item
const deleteInventoryItem = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const inventoryItem = await InventoryItem.findById(id);

    if (!inventoryItem) {
        throw new apiError("Inventory item not found", 404);
    }

    await InventoryItem.findByIdAndDelete(id);

    return res.status(200).json(
        new apiResponse(200, null, "Inventory item deleted successfully")
    );
});

// Get low stock items
const getLowStockItems = asyncHandler(async (req, res) => {
    const lowStockItems = await InventoryItem.find({
        $expr: {
            $and: [
                { $gt: ["$minThreshold", 0] },
                { $lte: ["$quantity", "$minThreshold"] }
            ]
        }
    }).populate('addedBy', 'fullname email role')
      .sort({ quantity: 1 });

    return res.status(200).json(
        new apiResponse(200, lowStockItems, "Low stock items retrieved successfully")
    );
});

// Get expired items
const getExpiredItems = asyncHandler(async (req, res) => {
    const expiredItems = await InventoryItem.find({
        expiryDate: { $lt: new Date() }
    }).populate('addedBy', 'fullname email role')
      .sort({ expiryDate: 1 });

    return res.status(200).json(
        new apiResponse(200, expiredItems, "Expired items retrieved successfully")
    );
});

// Get items by category
const getItemsByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;

    const items = await InventoryItem.find({ category })
        .populate('addedBy', 'fullname email role')
        .sort({ name: 1 });

    return res.status(200).json(
        new apiResponse(200, items, `Items in ${category} category retrieved successfully`)
    );
});

// Get inventory statistics
const getInventoryStats = asyncHandler(async (req, res) => {
    const totalItems = await InventoryItem.countDocuments();
    const lowStockCount = await InventoryItem.countDocuments({
        $expr: {
            $and: [
                { $gt: ["$minThreshold", 0] },
                { $lte: ["$quantity", "$minThreshold"] }
            ]
        }
    });
    const expiredCount = await InventoryItem.countDocuments({
        expiryDate: { $lt: new Date() }
    });
    const outOfStockCount = await InventoryItem.countDocuments({ quantity: 0 });

    const categoryStats = await InventoryItem.aggregate([
        {
            $group: {
                _id: "$category",
                count: { $sum: 1 },
                totalQuantity: { $sum: "$quantity" }
            }
        },
        { $sort: { count: -1 } }
    ]);

    const storageStats = await InventoryItem.aggregate([
        {
            $group: {
                _id: "$storageCondition",
                count: { $sum: 1 },
                totalQuantity: { $sum: "$quantity" }
            }
        },
        { $sort: { count: -1 } }
    ]);

    const stats = {
        totalItems,
        lowStockCount,
        expiredCount,
        outOfStockCount,
        categoryStats,
        storageStats
    };

    return res.status(200).json(
        new apiResponse(200, stats, "Inventory statistics retrieved successfully")
    );
});

// Export inventory data to CSV
const exportInventoryToCSV = asyncHandler(async (req, res) => {
    const { category, status, storageCondition } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (category) {
        filter.category = category;
    }
    
    if (status) {
        filter.status = status;
    }
    
    if (storageCondition) {
        filter.storageCondition = storageCondition;
    }

    // Get all inventory items (without pagination for export)
    const inventoryItems = await InventoryItem.find(filter)
        .populate('addedBy', 'fullname email')
        .populate('lastUpdatedBy', 'fullname email')
        .sort({ createdAt: -1 });

    if (!inventoryItems || inventoryItems.length === 0) {
        throw new apiError("No inventory items found to export", 404);
    }

    // Create CSV headers
    const headers = [
        'ID',
        'Name',
        'Quantity',
        'Unit',
        'Category',
        'Storage Condition',
        'Status',
        'Expiry Date',
        'Added Date',
        'Supplier',
        'Cost',
        'Min Threshold',
        'Max Threshold',
        'Notes',
        'Added By',
        'Last Updated By',
        'Created At',
        'Updated At'
    ];

    // Convert data to CSV format
    const csvData = inventoryItems.map(item => [
        item._id.toString(),
        `"${item.name}"`,
        item.quantity,
        item.unit,
        item.category,
        item.storageCondition,
        item.status,
        item.expiryDate ? item.expiryDate.toISOString().split('T')[0] : '',
        item.addedDate ? item.addedDate.toISOString().split('T')[0] : '',
        `"${item.supplier || ''}"`,
        item.cost || '',
        item.minThreshold || '',
        item.maxThreshold || '',
        `"${item.notes || ''}"`,
        `"${item.addedBy?.fullname || ''}"`,
        `"${item.lastUpdatedBy?.fullname || ''}"`,
        item.createdAt ? item.createdAt.toISOString() : '',
        item.updatedAt ? item.updatedAt.toISOString() : ''
    ]);

    // Combine headers and data
    const csvContent = [
        headers.join(','),
        ...csvData.map(row => row.join(','))
    ].join('\n');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `inventory_export_${timestamp}.csv`;

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    // Send CSV content
    res.status(200).send(csvContent);
});



// Process expired items and log them as waste
const processExpiredInventoryItems = asyncHandler(async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const result = await processExpiredItems(userId);

        return res.status(200).json(
            new apiResponse(200, result, `Processed ${result.processedCount} expired items. Total waste cost: $${result.totalWasteCost.toFixed(2)}`)
        );
    } catch (error) {
        console.error('Error processing expired items:', error);
        throw new apiError("Failed to process expired items", 500);
    }
});

// Apply daily intake to inventory items (bulk add stock per day)
const applyDailyIntake = asyncHandler(async (req, res) => {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
        throw new apiError("'entries' must be a non-empty array", 400);
    }

    const now = new Date();
    const results = [];

    for (const entry of entries) {
        const { inventoryItemId, quantity, reason } = entry || {};

        if (!inventoryItemId || quantity === undefined || quantity === null) {
            continue;
        }

        const addQty = Number(quantity);
        if (Number.isNaN(addQty) || addQty <= 0) {
            continue;
        }

        const updated = await InventoryItem.findByIdAndUpdate(
            inventoryItemId,
            {
                $inc: { currentStock: addQty, quantity: addQty },
                lastUpdatedBy: req.user?._id
            },
            { new: true }
        );

        if (!updated) {
            continue;
        }

        try {
            await Inventorylog.create({
                ingredient: inventoryItemId,
                change: addQty,
                reason: reason || "Daily intake",
                date: now
            });
        } catch (_) { /* ignore log failures */ }

        results.push({ id: updated._id, name: updated.name, newStock: updated.currentStock });
    }

    return res.status(200).json(
        new apiResponse(200, { updatedCount: results.length, results }, "Daily intake applied")
    );
});

export {
    getAllInventoryItems,
    getInventoryItemById,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    getLowStockItems,
    getExpiredItems,
    getItemsByCategory,
    getInventoryStats,
    exportInventoryToCSV,
    processExpiredInventoryItems,
    applyDailyIntake
};
