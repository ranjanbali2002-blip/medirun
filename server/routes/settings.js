import { Router } from "express";
import pool from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Get all settings (public — needed by frontend for UPI ID etc.)
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM app_settings");
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin updates a setting
router.patch("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(updates)) {
      await pool.query(`
        INSERT INTO app_settings (key, value, updated_at) VALUES ($1,$2,NOW())
        ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
      `, [key, value]);
    }
    const { rows } = await pool.query("SELECT key, value FROM app_settings");
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
