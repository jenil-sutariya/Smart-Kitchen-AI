import { InventoryItem } from "../models/inventory/inventoryItem.model.js";
import { WasteLog } from "../models/waste/wasteLog.model.js";
import { Inventorylog } from "../models/inventory/inventorylog.model.js";

/**
 * Process expired items and log them as waste
 * @param {String} loggedByUserId - User ID who is processing the waste (optional)
 * @returns {Object} - Summary of processed expired items
 */
export const processExpiredItems = async (loggedByUserId = null) => {
    try {
        const now = new Date();
        
        // Find all items that have expired and still have stock
        const expiredItems = await InventoryItem.find({
            expiryDate: { $lt: now },
            currentStock: { $gt: 0 },
            status: { $ne: 'discontinued' }
        });

        const processedItems = [];
        let totalWasteCost = 0;

        for (const item of expiredItems) {
            try {
                // Calculate waste cost (current stock * cost per unit)
                const wasteQuantity = item.currentStock;
                const wasteCost = item.cost ? wasteQuantity * item.cost : 0;
                totalWasteCost += wasteCost;

                // Map unit from inventory to waste log format (they should match now, but handle edge cases)
                let wasteUnit = item.unit;
                // Convert 'ltr' to 'litre' if needed (though we fixed the enum, keep this for safety)
                if (wasteUnit === 'ltr') {
                    wasteUnit = 'ltr'; // Keep as is since we fixed the enum
                }

                // Create waste log entry
                const wasteLog = await WasteLog.create({
                    ingredient: item._id,
                    category: 'expired',
                    quantity: wasteQuantity,
                    unit: wasteUnit,
                    loggedBy: loggedByUserId,
                    loggedAt: now,
                    notes: `Automatically logged expired item. Expired on ${item.expiryDate.toLocaleDateString()}`
                });

                // Create inventory log entry for tracking
                await Inventorylog.create({
                    ingredient: item._id,
                    change: -wasteQuantity,
                    reason: 'Item expired - moved to waste',
                    date: now
                });

                // Update inventory item - set stock to 0 and status to expired
                await InventoryItem.findByIdAndUpdate(
                    item._id,
                    {
                        currentStock: 0,
                        quantity: 0, // Also update quantity to match
                        status: 'expired',
                        lastUpdatedBy: loggedByUserId
                    }
                );

                processedItems.push({
                    itemId: item._id,
                    name: item.name,
                    quantity: wasteQuantity,
                    unit: wasteUnit,
                    wasteCost: wasteCost,
                    wasteLogId: wasteLog._id
                });
            } catch (error) {
                console.error(`Error processing expired item ${item._id}:`, error);
                // Continue with other items even if one fails
            }
        }

        return {
            success: true,
            processedCount: processedItems.length,
            totalWasteCost: totalWasteCost,
            processedItems: processedItems
        };
    } catch (error) {
        console.error('Error processing expired items:', error);
        throw error;
    }
};

/**
 * Check and update expired item statuses (called periodically)
 */
export const checkExpiredItems = async () => {
    try {
        const now = new Date();
        
        // Update status of expired items
        await InventoryItem.updateMany(
            {
                expiryDate: { $lt: now },
                status: { $ne: 'expired', $ne: 'discontinued' }
            },
            {
                $set: { status: 'expired' }
            }
        );

        return { success: true };
    } catch (error) {
        console.error('Error checking expired items:', error);
        throw error;
    }
};







