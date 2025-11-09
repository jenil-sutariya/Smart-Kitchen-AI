import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"
import { CORS_ORIGIN } from "./constant.js"

const app = express()

app.use(cors({
    origin : CORS_ORIGIN,
    credentials : true
}))

app.use(express.json({limit : "16kb"}))
app.use(express.urlencoded({extended : true,limit : "16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

//routes
import userRouter from "./src/routes/user.route.js"
import inventoryRouter from "./src/routes/inventory.route.js"
import dailyInventoryRouter from "./src/routes/dailyInventory.route.js"
import dashboardRouter from "./src/routes/dashboard.route.js"
import menuRouter from "./src/routes/menu.route.js"
import orderRouter from "./src/routes/order.route.js"
import salesRouter from "./src/routes/sales.route.js"
import wasteRouter from "./src/routes/waste.route.js"

// Health check endpoint (before routes)
app.get("/api/v1/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running",
        timestamp: new Date().toISOString()
    });
});

//routes declaration
app.use("/api/v1/user",userRouter)
app.use("/api/v1/inventory",inventoryRouter)
app.use("/api/v1/daily-inventory",dailyInventoryRouter)
app.use("/api/v1/dashboard",dashboardRouter)
app.use("/api/v1/menu",menuRouter)
app.use("/api/v1/orders",orderRouter)
app.use("/api/v1/sales",salesRouter)
app.use("/api/v1/waste",wasteRouter)

// Log registered routes for debugging
console.log("✅ Registered routes:");
console.log("  - GET  /api/v1/health");
console.log("  - POST /api/v1/user/login");
console.log("  - GET  /api/v1/waste");
console.log("  - GET  /api/v1/waste/stats");
console.log("  - POST /api/v1/waste/process-expired");

// 404 handler for undefined routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
        data: null,
        errors: []
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error("Error:", err);
    console.error("Error stack:", err.stack);
    
    if (err.name === 'apiError') {
        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.message,
            data: null,
            errors: err.errors || []
        });
    }
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: "Validation Error",
            data: null,
            errors: errors
        });
    }
    
    // Handle cast errors (invalid ObjectId, etc.)
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: ${err.value}`,
            data: null,
            errors: []
        });
    }
    
    // Handle other types of errors
    return res.status(500).json({
        success: false,
        message: err.message || "Internal Server Error",
        data: null,
        errors: []
    });
});

export {app}