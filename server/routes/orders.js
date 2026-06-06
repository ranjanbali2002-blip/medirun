import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, c.name as customer, c.address,
        array_agg(oi.medicine_name) as medicines
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id, c.name, c.address
      ORDER BY o.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, c.name as customer, c.address,
        array_agg(oi.medicine_name) as medicines
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, c.name, c.address
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Order not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, medicines, total, distance } = req.body;
    await client.query("BEGIN");
    const orderId = "ORX-" + Math.floor(1000 + Math.random() * 9000);
    const { rows } = await client.query(
      "INSERT INTO orders (id, customer_id, total, distance, status) VALUES ($1,$2,$3,$4,'pending') RETURNING *",
      [orderId, customer_id, total, distance]
    );
    for (const med of medicines) {
      await client.query(
        "INSERT INTO order_items (order_id, medicine_name, quantity) VALUES ($1,$2,$3)",
        [orderId, med.name, med.qty || 1]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
