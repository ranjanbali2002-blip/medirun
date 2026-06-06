import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import ordersRouter from "./routes/orders.js";
import medicinesRouter from "./routes/medicines.js";
import analyticsRouter from "./routes/analytics.js";
import routesRouter from "./routes/routes.js";
import ridersRouter from "./routes/riders.js";
import inventoryRouter from "./routes/inventory.js";
import paymentsRouter from "./routes/payments.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json({ limit: "10mb" })); // 10mb for prescription images

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/medicines", medicinesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/route-groups", routesRouter);
app.use("/api/riders", ridersRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/payments", paymentsRouter);

app.listen(PORT, () => console.log(`MediRun API running on port ${PORT}`));
