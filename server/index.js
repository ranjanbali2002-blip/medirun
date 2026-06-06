import express from "express";
import cors from "cors";
import ordersRouter from "./routes/orders.js";
import medicinesRouter from "./routes/medicines.js";
import analyticsRouter from "./routes/analytics.js";
import routesRouter from "./routes/routes.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/api/orders", ordersRouter);
app.use("/api/medicines", medicinesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/route-groups", routesRouter);

app.listen(PORT, () => console.log(`MediRun API running on port ${PORT}`));
