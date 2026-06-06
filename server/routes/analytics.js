import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const [revenue, orders, avgDist] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE created_at::date = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE status='pending') as pending FROM orders WHERE created_at::date = CURRENT_DATE"),
      pool.query("SELECT ROUND(AVG(distance)::numeric,1) as avg FROM orders WHERE created_at::date = CURRENT_DATE"),
    ]);
    res.json({
      revenue: revenue.rows[0].total,
      orders: orders.rows[0].count,
      pending: orders.rows[0].pending,
      avgDistance: avgDist.rows[0].avg,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/weekly", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at, 'Dy') as day,
             COALESCE(SUM(total),0) as revenue
      FROM orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(created_at), day
      ORDER BY DATE(created_at)
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/top-medicines", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT medicine_name as name, COUNT(*) as sales
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY medicine_name
      ORDER BY sales DESC
      LIMIT 5
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
