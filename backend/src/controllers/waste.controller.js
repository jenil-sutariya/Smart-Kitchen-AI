import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { WasteLog } from "../models/waste/wasteLog.model.js";
import { InventoryItem } from "../models/inventory/inventoryItem.model.js";
import { processExpiredItems as processExpiredItemsUtil } from "../utils/expiredItemsHandler.js";

// Get all waste logs
const getAllWasteLogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, startDate, endDate } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (category) {
        filter.category = category;
    }
    
    if (startDate || endDate) {
        filter.loggedAt = {};
        if (startDate) {
            filter.loggedAt.$gte = new Date(startDate);
        }
        if (endDate) {
            filter.loggedAt.$lte = new Date(endDate);
        }
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination info
    const total = await WasteLog.countDocuments(filter);

    // Get waste logs with pagination
    const wasteLogs = await WasteLog.find(filter)
        .populate('ingredient', 'name category unit cost')
        .populate('loggedBy', 'fullname email role')
        .sort({ loggedAt: -1 })
        .skip(skip)
        .limit(limitNum);

    // Create pagination response object
    const paginatedResponse = {
        docs: wasteLogs,
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
        new apiResponse(200, paginatedResponse, "Waste logs retrieved successfully")
    );
});

// Get waste log by ID
const getWasteLogById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const wasteLog = await WasteLog.findById(id)
        .populate('ingredient', 'name category unit cost')
        .populate('loggedBy', 'fullname email role');

    if (!wasteLog) {
        throw new apiError(404, "Waste log not found");
    }

    return res.status(200).json(
        new apiResponse(200, wasteLog, "Waste log retrieved successfully")
    );
});

// Create waste log
const createWasteLog = asyncHandler(async (req, res) => {
    const { ingredient, category, quantity, unit, notes, capturedImageUrl } = req.body;

    if (!ingredient || !category || !quantity || !unit) {
        throw new apiError(400, "Missing required fields: ingredient, category, quantity, unit");
    }

    // Verify ingredient exists
    const inventoryItem = await InventoryItem.findById(ingredient);
    if (!inventoryItem) {
        throw new apiError(404, "Ingredient not found");
    }

    // Create waste log
    const wasteLog = await WasteLog.create({
        ingredient,
        category,
        quantity: parseFloat(quantity),
        unit,
        notes,
        capturedImageUrl,
        loggedBy: req.user?._id || null
    });

    // Populate the created waste log
    await wasteLog.populate('ingredient', 'name category unit cost');
    await wasteLog.populate('loggedBy', 'fullname email role');

    return res.status(201).json(
        new apiResponse(201, wasteLog, "Waste log created successfully")
    );
});

// Get waste statistics
const getWasteStats = asyncHandler(async (req, res) => {
    const { startDate, endDate, period = '30d' } = req.query;
    
    // Build date filter
    let dateFilter = {};
    const now = new Date();
    
    if (startDate || endDate) {
        dateFilter.loggedAt = {};
        if (startDate) {
            dateFilter.loggedAt.$gte = new Date(startDate);
        }
        if (endDate) {
            dateFilter.loggedAt.$lte = new Date(endDate);
        }
    } else {
        // Calculate date range based on period
        const daysBack = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
        const startDateCalc = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
        dateFilter.loggedAt = { $gte: startDateCalc };
    }

    // Get total waste logs count
    const totalWasteLogs = await WasteLog.countDocuments(dateFilter);

    // Get total waste quantity
    const totalWasteQuantity = await WasteLog.aggregate([
        { $match: dateFilter },
        { $group: { _id: null, total: { $sum: "$quantity" } } }
    ]);
    const totalQuantity = totalWasteQuantity.length > 0 ? totalWasteQuantity[0].total : 0;

    // Get waste by category
    const wasteByCategory = await WasteLog.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: "$category",
                totalQuantity: { $sum: "$quantity" },
                count: { $sum: 1 }
            }
        },
        { $sort: { totalQuantity: -1 } }
    ]);

    // Get waste by ingredient (top 10)
    const wasteByIngredient = await WasteLog.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: "$ingredient",
                totalQuantity: { $sum: "$quantity" },
                count: { $sum: 1 }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 }
    ]);

    // Populate ingredient names
    const wasteByIngredientWithNames = await Promise.all(
        wasteByIngredient.map(async (item) => {
            const ingredient = await InventoryItem.findById(item._id).select('name category unit');
            return {
                ...item,
                ingredient: ingredient
            };
        })
    );

    // Calculate financial loss (if cost is available)
    const wasteLogsWithCost = await WasteLog.find(dateFilter)
        .populate('ingredient', 'cost unit');
    
    let totalFinancialLoss = 0;
    wasteLogsWithCost.forEach(log => {
        if (log.ingredient && log.ingredient.cost) {
            totalFinancialLoss += log.quantity * log.ingredient.cost;
        }
    });

    // Get waste trends (by day for last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const wasteTrends = await WasteLog.aggregate([
        {
            $match: {
                ...dateFilter,
                loggedAt: { $gte: thirtyDaysAgo }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: "$loggedAt" },
                    month: { $month: "$loggedAt" },
                    day: { $dayOfMonth: "$loggedAt" }
                },
                totalQuantity: { $sum: "$quantity" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    return res.status(200).json(
        new apiResponse(200, {
            totalWasteLogs,
            totalWasteQuantity: totalQuantity,
            totalFinancialLoss,
            wasteByCategory,
            wasteByIngredient: wasteByIngredientWithNames,
            wasteTrends
        }, "Waste statistics retrieved successfully")
    );
});

// Process expired items and log them as waste
const processExpiredItems = asyncHandler(async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const result = await processExpiredItemsUtil(userId);

        return res.status(200).json(
            new apiResponse(200, result, `Processed ${result.processedCount} expired items. Total waste cost: $${result.totalWasteCost.toFixed(2)}`)
        );
    } catch (error) {
        console.error('Error processing expired items:', error);
        throw new apiError(500, "Failed to process expired items");
    }
});

export {
    getAllWasteLogs,
    getWasteLogById,
    createWasteLog,
    getWasteStats,
    processExpiredItems
};

