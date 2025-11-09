import { InventoryItem } from "../models/inventory/inventoryItem.model.js";

/**
 * Check if all ingredients for a menu item are available in sufficient quantities
 * @param {Array} ingredients - Array of ingredient objects with ingredient ID, quantity, and unit
 * @param {Number} quantity - Number of dishes to make (default: 1)
 * @returns {Object} - { isAvailable: boolean, stockStatus: string, missingIngredients: Array }
 */
export const checkIngredientAvailability = async (ingredients, quantity = 1) => {
    const missingIngredients = [];
    let hasLowStock = false;
    let hasOutOfStock = false;

    for (const ingredient of ingredients) {
        const inventoryItem = await InventoryItem.findById(ingredient.ingredient);
        
        if (!inventoryItem) {
            missingIngredients.push({
                ingredient: ingredient.ingredient,
                name: 'Unknown Ingredient',
                required: ingredient.quantity * quantity,
                available: 0,
                unit: ingredient.unit,
                reason: 'Ingredient not found in inventory'
            });
            hasOutOfStock = true;
            continue;
        }

        // Check if ingredient is expired
        const now = new Date();
        const isExpired = inventoryItem.expiryDate && new Date(inventoryItem.expiryDate) < now;
        
        // If expired, treat as unavailable
        if (isExpired || inventoryItem.status === 'expired') {
            missingIngredients.push({
                ingredient: ingredient.ingredient,
                name: inventoryItem.name,
                required: ingredient.quantity * quantity,
                available: 0,
                unit: ingredient.unit,
                reason: 'Ingredient expired'
            });
            hasOutOfStock = true;
            continue;
        }

        const requiredQuantity = ingredient.quantity * quantity;
        const availableQuantity = inventoryItem.currentStock;

        if (availableQuantity < requiredQuantity) {
            missingIngredients.push({
                ingredient: ingredient.ingredient,
                name: inventoryItem.name,
                required: requiredQuantity,
                available: availableQuantity,
                unit: ingredient.unit,
                reason: availableQuantity === 0 ? 'Out of stock' : 'Insufficient quantity'
            });
            
            if (availableQuantity === 0) {
                hasOutOfStock = true;
            } else {
                hasLowStock = true;
            }
        } else if (inventoryItem.status === 'low_stock' || 
                   (inventoryItem.minThreshold > 0 && availableQuantity <= inventoryItem.minThreshold)) {
            hasLowStock = true;
        }
    }

    // Determine overall stock status
    let stockStatus = 'available';
    let isAvailable = true;

    if (hasOutOfStock || missingIngredients.length > 0) {
        stockStatus = 'out_of_stock';
        isAvailable = false;
    } else if (hasLowStock) {
        stockStatus = 'low_stock';
        isAvailable = true; // Still available but with low stock warning
    }

    return {
        isAvailable,
        stockStatus,
        missingIngredients
    };
};

/**
 * Update menu item stock status based on ingredient availability
 * @param {String} menuItemId - ID of the menu item to update
 * @param {Number} quantity - Number of dishes to check for (default: 1)
 * @returns {Object} - Updated stock status information
 */
export const updateMenuItemStockStatus = async (menuItemId, quantity = 1) => {
    const { MenuItem } = await import("../models/menu/menuItem.model.js");
    
    const menuItem = await MenuItem.findById(menuItemId)
        .populate('ingredients.ingredient');
    
    if (!menuItem) {
        throw new Error('Menu item not found');
    }

    const stockCheck = await checkIngredientAvailability(menuItem.ingredients, quantity);
    
    // Update menu item with new stock status
    menuItem.isAvailable = stockCheck.isAvailable;
    menuItem.stockStatus = stockCheck.stockStatus;
    await menuItem.save();

    return {
        menuItem,
        stockCheck
    };
};

/**
 * Check and update stock status for multiple menu items
 * @param {Array} menuItemIds - Array of menu item IDs
 * @returns {Array} - Array of updated menu items with stock status
 */
export const updateMultipleMenuItemStockStatus = async (menuItemIds) => {
    const { MenuItem } = await import("../models/menu/menuItem.model.js");
    
    const results = [];
    
    for (const menuItemId of menuItemIds) {
        try {
            const result = await updateMenuItemStockStatus(menuItemId);
            results.push(result);
        } catch (error) {
            console.error(`Error updating stock status for menu item ${menuItemId}:`, error);
        }
    }
    
    return results;
};
