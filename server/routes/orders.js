import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    let query, params = [];
    if (req.user.role === "admin") {
      query = `
        SELECT o.*, u.name as customer, u.phone as customer_phone, u.address,
          array_agg(oi.medicine_name) as medicines,
          ru.name as rider_name
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN riders r ON r.id = o.rider_id
        LEFT JOIN users ru ON ru.id = r.user_id
        GROUP BY o.id, u.name, u.phone, u.address, ru.name
        ORDER BY o.created_at DESC`;
    } else if (req.user.role === "customer") {
      query = `
        SELECT o.*, array_agg(oi.medicine_name) as medicines
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = $1
        GROUP BY o.id ORDER BY o.created_at DESC`;
      params = [req.user.id];
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { medicines, total, delivery_fee, delivery_address, delivery_lat, delivery_lon, delivery_distance, prescription_data, requires_prescription } = req.body;
    await client.query("BEGIN");
    const orderId = "ORX-" + Math.floor(1000 + Math.random() * 9000);
    const { rows } = await client.query(
      `INSERT INTO orders (id,user_id,total,delivery_fee,delivery_address,delivery_lat,delivery_lon,
        delivery_distance,items,status,payment_status,prescription_data,requires_prescription)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','unpaid',$10,$11) RETURNING *`,
      [orderId, req.user.id, total, delivery_fee, delivery_address, delivery_lat, delivery_lon,
       delivery_distance, medicines.length, prescription_data || null, requires_prescription || false]
    );
    for (const m of medicines) {
      await client.query(
        "INSERT INTO order_items (order_id,medicine_name,quantity,price) VALUES ($1,$2,$3,$4)",
        [orderId, m.name, m.qty || 1, m.price]
      );
      await client.query("UPDATE medicines SET stock = GREATEST(stock-1,0) WHERE name=$1", [m.name]);
    }
    await client.query("COMMIT");
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, u.name as customer, u.phone as customer_phone,
        array_agg(oi.medicine_name) as medicines,
        ru.name as rider_name, ru.phone as rider_phone,
        rl.lat as rider_lat, rl.lon as rider_lon
      FROM orders o
      LEFT JOIN users u ON u.id=o.user_id
      LEFT JOIN order_items oi ON oi.order_id=o.id
      LEFT JOIN riders r ON r.id=o.rider_id
      LEFT JOIN users ru ON ru.id=r.user_id
      LEFT JOIN rider_locations rl ON rl.rider_id=r.id
      WHERE o.id=$1
      GROUP BY o.id,u.name,u.phone,ru.name,ru.phone,rl.lat,rl.lon
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2 RETURNING *", [status, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin assigns a rider
router.patch("/:id/assign-rider", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rider_id } = req.body;
    const { rows } = await pool.query(
      "UPDATE orders SET rider_id=$1, status='transit' WHERE id=$2 RETURNING *", [rider_id, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin approves prescription
router.patch("/:id/prescription", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { prescription_status } = req.body; // 'approved' | 'rejected'
    const { rows } = await pool.query(
      "UPDATE orders SET prescription_status=$1 WHERE id=$2 RETURNING *",
      [prescription_status, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
