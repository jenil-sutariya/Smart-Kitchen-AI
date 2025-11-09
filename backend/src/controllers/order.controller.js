import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { Order } from "../models/order/order.model.js";
import { MenuItem } from "../models/menu/menuItem.model.js";
import { InventoryItem } from "../models/inventory/inventoryItem.model.js";
import { Inventorylog } from "../models/inventory/inventorylog.model.js";
import { Sales } from "../models/demand/salesData.model.js";
import { checkIngredientAvailability } from "../utils/stockChecker.js";
import { deductFromDailyInventory } from "./dailyInventory.controller.js";

// Create new order
const createOrder = asyncHandler(async (req, res) => {
    const { customerName, customerPhone, customerEmail, orderType, items, notes } = req.body;

    // Validate user authentication
    if (!req.user || !req.user._id) {
        throw new apiError("User authentication required", 401);
    }

    // Validate restaurant
    if (!req.user.restaurant) {
        throw new apiError("User restaurant information is missing", 400);
    }

    // Validate required fields
    if (!customerName || !items || items.length === 0) {
        throw new apiError("Customer name and at least one item are required", 400);
    }

    // Validate items structure
    if (!Array.isArray(items)) {
        throw new apiError("Items must be an array", 400);
    }

    // Validate and check ingredient availability for each item
    const validatedItems = [];
    let subtotal = 0;

    for (const orderItem of items) {
        // Validate order item structure
        if (!orderItem.menuItem) {
            throw new apiError("Each item must have a menuItem ID", 400);
        }
        if (!orderItem.quantity || orderItem.quantity < 1) {
            throw new apiError("Each item must have a valid quantity (at least 1)", 400);
        }
        if (!orderItem.unitPrice || orderItem.unitPrice < 0) {
            throw new apiError("Each item must have a valid unit price", 400);
        }

        const menuItem = await MenuItem.findById(orderItem.menuItem)
            .populate('ingredients.ingredient');
        
        if (!menuItem) {
            throw new apiError(`Menu item with ID ${orderItem.menuItem} not found`, 400);
        }

        // Check if menu item has ingredients
        if (!menuItem.ingredients || menuItem.ingredients.length === 0) {
            throw new apiError(`Menu item "${menuItem.name}" has no ingredients configured`, 400);
        }

        // Check ingredient availability using the stock checker utility
        const stockCheck = await checkIngredientAvailability(menuItem.ingredients, orderItem.quantity);
        
        if (!stockCheck.isAvailable) {
            const missingIngredientsList = stockCheck.missingIngredients
                .map(ing => `${ing.name}: Required ${ing.required} ${ing.unit}, Available ${ing.available} ${ing.unit}`)
                .join(', ');
            
            throw new apiError(`Dish "${menuItem.name}" is out of stock. Missing ingredients: ${missingIngredientsList}`, 400);
        }

        const totalPrice = orderItem.quantity * orderItem.unitPrice;
        subtotal += totalPrice;

        validatedItems.push({
            menuItem: orderItem.menuItem,
            quantity: orderItem.quantity,
            unitPrice: orderItem.unitPrice,
            totalPrice: totalPrice
        });
    }

    // Create the order
    let order;
    try {
        order = await Order.create({
            customerName,
            customerPhone,
            customerEmail,
            orderType: orderType || 'dine-in',
            items: validatedItems,
            subtotal,
            totalAmount: subtotal,
            notes: notes || '',
            createdBy: req.user._id,
            restaurant: req.user.restaurant || 'restaurant1'
        });
    } catch (orderError) {
        console.error('Error creating order:', orderError);
        throw new apiError(`Failed to create order: ${orderError.message}`, 500);
    }

    // Deduct ingredients from inventory and create sales data
    for (const orderItem of items) {
        try {
            const menuItem = await MenuItem.findById(orderItem.menuItem)
                .populate('ingredients.ingredient');
            
            if (!menuItem) {
                console.error(`Menu item ${orderItem.menuItem} not found during inventory deduction`);
                continue;
            }

            // Deduct ingredients from inventory
            if (menuItem.ingredients && Array.isArray(menuItem.ingredients) && menuItem.ingredients.length > 0) {
                for (const ingredient of menuItem.ingredients) {
                    if (!ingredient || !ingredient.ingredient) {
                        console.error(`Invalid ingredient reference in menu item ${menuItem.name}`);
                        continue;
                    }

                    const ingredientId = ingredient.ingredient._id || ingredient.ingredient;
                    if (!ingredientId) {
                        console.error(`Missing ingredient ID in menu item ${menuItem.name}`);
                        continue;
                    }

                    const requiredQuantity = ingredient.quantity * orderItem.quantity;
                    
                    try {
                        // Get current inventory item to check stock
                        const inventoryItem = await InventoryItem.findById(ingredientId);
                        if (!inventoryItem) {
                            console.error(`Inventory item ${ingredientId} not found`);
                            continue;
                        }

                        // Check if sufficient stock is available in main inventory
                        if (inventoryItem.currentStock < requiredQuantity) {
                            throw new apiError(
                                `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.currentStock}, Required: ${requiredQuantity}`,
                                400
                            );
                        }

                        // Deduct from daily inventory (this also updates main inventory)
                        await deductFromDailyInventory(ingredientId, requiredQuantity, req.user._id);

                        // Create inventory log entry
                        await Inventorylog.create({
                            ingredient: ingredientId,
                            change: -requiredQuantity,
                            reason: `Used in order for ${menuItem.name}`,
                            date: new Date()
                        });
                    } catch (error) {
                        console.error(`Error updating inventory for ingredient ${ingredientId}:`, error);
                        // If it's an apiError, throw it; otherwise continue
                        if (error instanceof apiError) {
                            throw error;
                        }
                        // Continue with other ingredients if it's not a critical error
                    }
                }
            }

            // Create sales data entry
            try {
                const saleDate = new Date();
                const dayOfWeek = saleDate.toLocaleDateString('en-US', { weekday: 'long' });
                
                // Determine season based on month
                const month = saleDate.getMonth();
                let season;
                if (month >= 2 && month <= 4) season = 'Spring';
                else if (month >= 5 && month <= 7) season = 'Summer';
                else if (month >= 8 && month <= 10) season = 'Autumn';
                else season = 'Winter';

                await Sales.create({
                    product: orderItem.menuItem,
                    quantitySold: orderItem.quantity,
                    saleDate: saleDate,
                    dayOfWeek: dayOfWeek,
                    season: season,
                    specialEvent: 'Reguler'
                });
            } catch (salesError) {
                console.error(`Error creating sales data for order item ${orderItem.menuItem}:`, salesError);
                // Don't fail the entire order if sales data creation fails
            }
        } catch (error) {
            console.error(`Error processing order item ${orderItem.menuItem}:`, error);
            // Continue with other items
        }
    }

    // Populate the created order
    const populatedOrder = await Order.findById(order._id)
        .populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description'
        })
        .populate('createdBy', 'fullname email role');

    return res.status(201).json(
        new apiResponse(201, populatedOrder, "Order created successfully")
    );
});

// Get all orders
const getAllOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status, orderType, search } = req.query;
    
    // Build filter object - filter by restaurant
    const filter = {
        restaurant: req.user.restaurant
    };
    
    if (status) {
        filter.status = status;
    }
    
    if (orderType) {
        filter.orderType = orderType;
    }
    
    if (search) {
        filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { orderNumber: { $regex: search, $options: 'i' } }
        ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination info
    const total = await Order.countDocuments(filter);

    // Get orders with pagination
    const orders = await Order.find(filter)
        .populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description'
        })
        .populate('createdBy', 'fullname email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

    // Create pagination response object
    const paginatedResponse = {
        docs: orders,
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
        new apiResponse(200, paginatedResponse, "Orders retrieved successfully")
    );
});

// Get order by ID
const getOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await Order.findOne({ 
        _id: id, 
        restaurant: req.user.restaurant 
    })
        .populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description ingredients'
        })
        .populate('createdBy', 'fullname email role')
        .populate('updatedBy', 'fullname email role');

    if (!order) {
        throw new apiError("Order not found", 404);
    }

    return res.status(200).json(
        new apiResponse(200, order, "Order retrieved successfully")
    );
});

// Update order status
const updateOrderStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, estimatedTime, notes } = req.body;

    if (!status) {
        throw new apiError("Status is required", 400);
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
        throw new apiError("Invalid status", 400);
    }

    // Load existing order to handle inventory adjustments on status transitions
    const existingOrder = await Order.findById(id).populate({
        path: 'items.menuItem',
        model: 'MenuItem',
        select: 'name ingredients',
        populate: { path: 'ingredients.ingredient', model: 'InventoryItem' }
    });

    if (!existingOrder) {
        throw new apiError("Order not found", 404);
    }

    // If transitioning to cancelled (and wasn't already cancelled), restore inventory used by this order
    if (status === 'cancelled' && existingOrder.status !== 'cancelled') {
        for (const orderItem of existingOrder.items) {
            // Ensure we have full menu item with ingredients
            const menuItem = await MenuItem.findById(orderItem.menuItem)
                .populate('ingredients.ingredient');

            if (!menuItem || !Array.isArray(menuItem.ingredients)) continue;

            for (const ingredient of menuItem.ingredients) {
                if (!ingredient || !ingredient.ingredient) continue;

                const ingredientId = ingredient.ingredient._id || ingredient.ingredient;
                const restoredQuantity = (ingredient.quantity || 0) * (orderItem.quantity || 0);
                if (restoredQuantity <= 0) continue;

                await InventoryItem.findByIdAndUpdate(
                    ingredientId,
                    {
                        $inc: { currentStock: restoredQuantity },
                        lastUpdatedBy: req.user?._id
                    }
                );

                // Log the restoration
                try {
                    await Inventorylog.create({
                        ingredient: ingredientId,
                        change: restoredQuantity,
                        reason: `Restored due to order cancellation ${existingOrder.orderNumber || id}`,
                        date: new Date()
                    });
                } catch (_) {
                    // Logging failure shouldn't block the flow
                }
            }
        }
    }

    const updateData = {
        status,
        updatedBy: req.user._id
    };

    if (estimatedTime) {
        updateData.estimatedTime = new Date(estimatedTime);
    }

    if (notes) {
        updateData.notes = notes;
    }

    // If status is delivered, set actual delivery time
    if (status === 'delivered') {
        updateData.actualDeliveryTime = new Date();
    }

    const updatedOrder = await Order.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).populate({
        path: 'items.menuItem',
        model: 'MenuItem',
        select: 'name description'
    }).populate('createdBy', 'fullname email role');

    return res.status(200).json(
        new apiResponse(200, updatedOrder, "Order status updated successfully")
    );
});

// Update order (edit order)
const updateOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { customerName, customerPhone, customerEmail, orderType, items, notes, tax, discount } = req.body;

    // Find the existing order
    const existingOrder = await Order.findOne({ 
        _id: id, 
        restaurant: req.user.restaurant 
    }).populate('items.menuItem');

    if (!existingOrder) {
        throw new apiError("Order not found", 404);
    }

    // If order is already delivered or cancelled, don't allow editing
    if (existingOrder.status === 'delivered' || existingOrder.status === 'cancelled') {
        throw new apiError("Cannot edit order that is already delivered or cancelled", 400);
    }

    // If items are being changed, we need to:
    // 1. Restore ingredients from old items
    // 2. Check availability for new items
    // 3. Deduct ingredients for new items

    if (items && items.length > 0) {
        // Restore ingredients from existing order items
        for (const orderItem of existingOrder.items) {
            const menuItem = await MenuItem.findById(orderItem.menuItem)
                .populate('ingredients.ingredient');
            
            if (menuItem) {
                for (const ingredient of menuItem.ingredients) {
                    const restoredQuantity = ingredient.quantity * orderItem.quantity;
                    
                    await InventoryItem.findByIdAndUpdate(
                        ingredient.ingredient._id,
                        { 
                            $inc: { currentStock: restoredQuantity },
                            lastUpdatedBy: req.user._id
                        }
                    );
                }
            }
        }

        // Validate and check ingredient availability for new items
        const validatedItems = [];
        let subtotal = 0;

        for (const orderItem of items) {
            const menuItem = await MenuItem.findById(orderItem.menuItem)
                .populate('ingredients.ingredient');
            
            if (!menuItem) {
                throw new apiError(`Menu item with ID ${orderItem.menuItem} not found`, 400);
            }

            // Check ingredient availability
            const stockCheck = await checkIngredientAvailability(menuItem.ingredients, orderItem.quantity);
            
            if (!stockCheck.isAvailable) {
                const missingIngredientsList = stockCheck.missingIngredients
                    .map(ing => `${ing.name}: Required ${ing.required} ${ing.unit}, Available ${ing.available} ${ing.unit}`)
                    .join(', ');
                
                throw new apiError(`Dish "${menuItem.name}" is out of stock. Missing ingredients: ${missingIngredientsList}`, 400);
            }

            const totalPrice = orderItem.quantity * orderItem.unitPrice;
            subtotal += totalPrice;

            validatedItems.push({
                menuItem: orderItem.menuItem,
                quantity: orderItem.quantity,
                unitPrice: orderItem.unitPrice,
                totalPrice: totalPrice
            });

            // Deduct ingredients from inventory
            for (const ingredient of menuItem.ingredients) {
                const requiredQuantity = ingredient.quantity * orderItem.quantity;
                
                // Deduct from daily inventory (this also updates main inventory)
                try {
                    await deductFromDailyInventory(ingredient.ingredient._id, requiredQuantity, req.user._id);
                } catch (error) {
                    console.error(`Error deducting from daily inventory for ingredient ${ingredient.ingredient._id}:`, error);
                    // If it's an apiError, throw it
                    if (error instanceof apiError) {
                        throw error;
                    }
                }
            }
        }

        // Update order with new items
        const updateData = {
            items: validatedItems,
            subtotal: subtotal,
            totalAmount: subtotal - (discount || 0) + (tax || 0),
            updatedBy: req.user._id
        };

        if (customerName) updateData.customerName = customerName;
        if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
        if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
        if (orderType) updateData.orderType = orderType;
        if (notes !== undefined) updateData.notes = notes;
        if (tax !== undefined) updateData.tax = tax;
        if (discount !== undefined) updateData.discount = discount;

        const updatedOrder = await Order.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description'
        }).populate('createdBy', 'fullname email role')
        .populate('updatedBy', 'fullname email role');

        return res.status(200).json(
            new apiResponse(200, updatedOrder, "Order updated successfully")
        );
    } else {
        // Update other fields without changing items
        const updateData = {
            updatedBy: req.user._id
        };

        if (customerName) updateData.customerName = customerName;
        if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
        if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
        if (orderType) updateData.orderType = orderType;
        if (notes !== undefined) updateData.notes = notes;
        if (tax !== undefined) {
            updateData.tax = tax;
            updateData.totalAmount = existingOrder.subtotal - (discount || existingOrder.discount || 0) + tax;
        }
        if (discount !== undefined) {
            updateData.discount = discount;
            updateData.totalAmount = existingOrder.subtotal - discount + (tax || existingOrder.tax || 0);
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description'
        }).populate('createdBy', 'fullname email role')
        .populate('updatedBy', 'fullname email role');

        return res.status(200).json(
            new apiResponse(200, updatedOrder, "Order updated successfully")
        );
    }
});

// Delete order
const deleteOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
        throw new apiError("Order not found", 404);
    }

    await Order.findByIdAndDelete(id);

    return res.status(200).json(
        new apiResponse(200, null, "Order deleted successfully")
    );
});

// Get order statistics
const getOrderStats = asyncHandler(async (req, res) => {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const preparingOrders = await Order.countDocuments({ status: 'preparing' });
    const completedOrders = await Order.countDocuments({ status: 'delivered' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });

    // Calculate total revenue
    const revenueResult = await Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    const stats = {
        totalOrders,
        pendingOrders,
        preparingOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue
    };

    return res.status(200).json(
        new apiResponse(200, stats, "Order statistics retrieved successfully")
    );
});

// Get invoice data for an order
const getInvoice = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const order = await Order.findOne({ 
        _id: id, 
        restaurant: req.user.restaurant 
    })
        .populate({
            path: 'items.menuItem',
            model: 'MenuItem',
            select: 'name description'
        })
        .populate('createdBy', 'fullname email role');

    if (!order) {
        throw new apiError("Order not found", 404);
    }

    // Return invoice data
    return res.status(200).json(
        new apiResponse(200, order, "Invoice data retrieved successfully")
    );
});

export {
    createOrder,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    updateOrder,
    deleteOrder,
    getOrderStats,
    getInvoice
};
