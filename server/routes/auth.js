import { Router } from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import https from "https";

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

// Admin adds a new rider
router.post("/add-rider", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  try {
    jwt.verify(token, SECRET); // must be logged in
    const { phone, name, vehicle } = req.body;
    if (!phone || phone.length < 10) return res.status(400).json({ error: "Invalid phone" });
    const { rows } = await pool.query(`
      INSERT INTO users (phone, name, role) VALUES ($1,$2,'rider')
      ON CONFLICT (phone) DO UPDATE SET name=$2, role='rider'
      RETURNING id
    `, [phone, name || "Rider"]);
    await pool.query(
      "INSERT INTO riders (user_id, vehicle) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [rows[0].id, vehicle || "Bike"]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Called after Firebase verifies the phone OTP on the frontend
router.post("/firebase-login", async (req, res) => {
  try {
    const { firebaseToken, phone } = req.body;

    // Verify the Firebase ID token with Google's public API
    const FIREBASE_PROJECT = "medirun-e8ecc";
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDlkpxfmUMA36TIiHPqEyAje-Vbazz22EI`;
    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: firebaseToken })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.users?.[0]) return res.status(401).json({ error: "Invalid Firebase token" });

    const firebasePhone = verifyData.users[0].phoneNumber?.replace("+91","") || phone;

    // Find or create user
    let { rows } = await pool.query("SELECT * FROM users WHERE phone=$1", [firebasePhone]);
    if (!rows[0]) {
      const r = await pool.query(
        "INSERT INTO users (phone, name, role) VALUES ($1,'Customer','customer') RETURNING *",
        [firebasePhone]
      );
      rows = r.rows;
    }
    const user = rows[0];
    const token = jwt.sign({ userId: user.id, role: user.role }, SECRET, { expiresIn: "30d" });
    res.json({ token, user: { id:user.id, name:user.name, phone:user.phone, role:user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
