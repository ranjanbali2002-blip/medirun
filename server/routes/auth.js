import { Router } from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = Router();
const SECRET = process.env.JWT_SECRET || "medirun-dev-secret";
const DEMO_OTP = "123456";

router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) return res.status(400).json({ error: "Invalid phone number" });
  const otp = process.env.NODE_ENV === "production"
    ? Math.floor(100000 + Math.random() * 900000).toString()
    : DEMO_OTP;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    "INSERT INTO otps (phone, code, expires_at) VALUES ($1,$2,$3)",
    [phone, otp, expiresAt]
  );
  // TODO production: send SMS via MSG91/Twilio here
  res.json({ success: true, ...(process.env.NODE_ENV !== "production" && { otp }) });
});

router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body;
  const { rows } = await pool.query(
    "SELECT * FROM otps WHERE phone=$1 AND code=$2 AND expires_at>NOW() AND used=FALSE ORDER BY created_at DESC LIMIT 1",
    [phone, code]
  );
  if (!rows[0]) return res.status(400).json({ error: "Invalid or expired OTP" });
  await pool.query("UPDATE otps SET used=TRUE WHERE id=$1", [rows[0].id]);

  let { rows: users } = await pool.query("SELECT * FROM users WHERE phone=$1", [phone]);
  if (!users[0]) {
    const r = await pool.query(
      "INSERT INTO users (phone, name, role) VALUES ($1,$2,'customer') RETURNING *",
      [phone, "Customer"]
    );
    users = r.rows;
  }
  const user = users[0];
  const token = jwt.sign({ userId: user.id, role: user.role }, SECRET, { expiresIn: "30d" });
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, address: user.address } });
});

router.get("/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const { userId } = jwt.verify(token, SECRET);
    const { rows } = await pool.query(
      "SELECT id,name,phone,role,address FROM users WHERE id=$1", [userId]
    );
    if (!rows[0]) return res.status(401).json({ error: "Not found" });
    res.json(rows[0]);
  } catch { res.status(401).json({ error: "Invalid token" }); }
});

router.patch("/profile", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  try {
    const { userId } = jwt.verify(token, SECRET);
    const { name, address } = req.body;
    const { rows } = await pool.query(
      "UPDATE users SET name=COALESCE($1,name), address=COALESCE($2,address) WHERE id=$3 RETURNING id,name,phone,role,address",
      [name, address, userId]
    );
    res.json(rows[0]);
  } catch { res.status(401).json({ error: "Unauthorized" }); }
});

export default router;
