import mongoose, { Schema } from "mongoose";

const dailyInventoryEntrySchema = new Schema({
    date: {
        type: Date,
        required: [true, "Date is required"],
        index: true
    },
    inventoryItem: {
        type: Schema.Types.ObjectId,
        ref: "InventoryItem",
        required: [true, "Inventory item reference is required"]
    },
    quantity: {
        type: Number,
        required: [true, "Quantity is required"],
        min: [0, "Quantity cannot be negative"]
    },
    cost: {
        type: Number,
        required: false,
        min: [0, "Cost cannot be negative"]
    },
    expiryDate: {
        type: Date,
        required: false
    },
    remainingQuantity: {
        type: Number,
        required: true,
        min: [0, "Remaining quantity cannot be negative"],
        default: function() { return this.quantity; }
    },
    addedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

// Compound index for date and inventory item
dailyInventoryEntrySchema.index({ date: 1, inventoryItem: 1 });

// Index for date queries
dailyInventoryEntrySchema.index({ date: -1 });

export const DailyInventoryEntry = mongoose.model("DailyInventoryEntry", dailyInventoryEntrySchema);

