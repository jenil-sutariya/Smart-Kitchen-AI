import mongoose, { Schema } from "mongoose";

const dayStatusSchema = new Schema({
    date: {
        type: Date,
        required: [true, "Date is required"],
        unique: true,
        index: true
    },
    isEnded: {
        type: Boolean,
        default: false,
        required: true
    },
    endedAt: {
        type: Date,
        required: false
    },
    endedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: false
    }
}, { timestamps: true });

// Index for date queries
dayStatusSchema.index({ date: -1 });

export const DayStatus = mongoose.model("DayStatus", dayStatusSchema);

