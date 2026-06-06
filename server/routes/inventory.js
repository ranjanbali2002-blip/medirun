import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM medicines ORDER BY name");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { stock, price, requires_prescription } = req.body;
    const { rows } = await pool.query(
      `UPDATE medicines SET
        stock = COALESCE($1, stock),
        price = COALESCE($2, price),
        requires_prescription = COALESCE($3, requires_prescription)
       WHERE id=$4 RETURNING *`,
      [stock, price, requires_prescription, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, brand, price, category, icon, stock, requires_prescription } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO medicines (name,brand,price,category,icon,stock,requires_prescription) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, brand, price, category, icon || "💊", stock || 100, requires_prescription || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
