import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Customer records a UPI payment attempt
router.post("/", requireAuth, async (req, res) => {
  try {
    const { order_id, amount, utr_ref } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO payments (order_id, amount, method, utr_ref, status) VALUES ($1,$2,'upi',$3,'pending') RETURNING *",
      [order_id, amount, utr_ref]
    );
    await pool.query("UPDATE orders SET payment_status='pending_verification', upi_ref=$1 WHERE id=$2", [utr_ref, order_id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin verifies payment
router.patch("/:id/verify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body; // 'paid' or 'rejected'
    const { rows } = await pool.query(
      "UPDATE payments SET status=$1 WHERE id=$2 RETURNING *", [status, req.params.id]
    );
    if (rows[0]) {
      const orderStatus = status === "paid" ? "confirmed" : "payment_failed";
      await pool.query("UPDATE orders SET payment_status=$1 WHERE id=$2", [status, rows[0].order_id]);
      if (status === "paid") {
        await pool.query("UPDATE orders SET status='confirmed' WHERE id=$1", [rows[0].order_id]);
      }
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List payments pending verification
router.get("/pending", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT p.*, o.id as order_id, u.name as customer_name FROM payments p JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.user_id WHERE p.status='pending' ORDER BY p.created_at DESC"
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
