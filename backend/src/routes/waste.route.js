import { Router } from "express";
import {
    getAllWasteLogs,
    getWasteLogById,
    createWasteLog,
    getWasteStats,
    processExpiredItems
} from "../controllers/waste.controller.js";
import { verifyAdminOrChef, verifyChef } from "../middleware/auth.middleware.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(verifyAdminOrChef);

// Get all waste logs
router.route("/").get(getAllWasteLogs);

// Get waste statistics
router.route("/stats").get(getWasteStats);

// Process expired items and log them as waste
router.route("/process-expired").post(verifyChef, processExpiredItems);

// Create new waste log
router.route("/").post(verifyChef, createWasteLog);

// Get single waste log by ID
router.route("/:id").get(getWasteLogById);

export default router;




