import { Router } from "express";
import {
    getTodayInventory,
    getDateInventory,
    addItemToToday,
    endDay,
    startNewDay,
    getDayStatus,
    getAvailableItemsForToday
} from "../controllers/dailyInventory.controller.js";
import { verifyAdminOrChef, verifyChef } from "../middleware/auth.middleware.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(verifyAdminOrChef);

// Get today's inventory
router.route("/today").get(getTodayInventory);

// Get inventory for a specific date
router.route("/date/:date").get(getDateInventory);

// Get day status
router.route("/day-status").get(getDayStatus);

// Get available items (generalized inventory items)
router.route("/available-items").get(getAvailableItemsForToday);

// Add item to today's inventory (requires chef role)
router.route("/add-item").post(verifyChef, addItemToToday);

// End the day (requires chef role)
router.route("/end-day").post(verifyChef, endDay);

// Start new day (requires chef role)
router.route("/start-new-day").post(verifyChef, startNewDay);

export default router;

