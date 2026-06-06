import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT rg.*, r.name as rider,
        array_agg(rgo.order_id) as orders
      FROM route_groups rg
      JOIN riders r ON r.id = rg.rider_id
      LEFT JOIN route_group_orders rgo ON rgo.route_group_id = rg.id
      GROUP BY rg.id, r.name
      ORDER BY rg.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
