import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, u.name, u.phone,
        rl.lat, rl.lon, rl.updated_at as location_updated,
        COUNT(o.id) FILTER (WHERE o.status IN ('transit','confirmed')) as active_orders,
        COUNT(o.id) FILTER (WHERE o.status = 'delivered' AND o.created_at::date = CURRENT_DATE) as today_deliveries
      FROM riders r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN rider_locations rl ON rl.rider_id = r.id
      LEFT JOIN orders o ON o.rider_id = r.id
      GROUP BY r.id, u.name, u.phone, rl.lat, rl.lon, rl.updated_at
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rider updates their GPS location
router.post("/location", requireAuth, requireRole("rider"), async (req, res) => {
  try {
    const { lat, lon } = req.body;
    const { rows: riderRows } = await pool.query("SELECT id FROM riders WHERE user_id=$1", [req.user.id]);
    if (!riderRows[0]) return res.status(404).json({ error: "Rider not found" });
    await pool.query(`
      INSERT INTO rider_locations (rider_id, lat, lon, updated_at)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (rider_id) DO UPDATE SET lat=$2, lon=$3, updated_at=NOW()
    `, [riderRows[0].id, lat, lon]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get rider location for tracking
router.get("/:id/location", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT lat, lon, updated_at FROM rider_locations WHERE rider_id=$1", [req.params.id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rider toggles availability
router.patch("/availability", requireAuth, requireRole("rider"), async (req, res) => {
  try {
    const { available } = req.body;
    const { rows } = await pool.query(
      "UPDATE riders SET available=$1 WHERE user_id=$2 RETURNING *", [available, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rider's assigned orders
router.get("/my-orders", requireAuth, requireRole("rider"), async (req, res) => {
  try {
    const { rows: riderRows } = await pool.query("SELECT id FROM riders WHERE user_id=$1", [req.user.id]);
    if (!riderRows[0]) return res.json([]);
    const { rows } = await pool.query(`
      SELECT o.*, u.name as customer_name, u.phone as customer_phone
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.rider_id=$1 AND o.status NOT IN ('delivered','cancelled')
      ORDER BY o.created_at DESC
    `, [riderRows[0].id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
