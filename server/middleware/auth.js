import jwt from "jsonwebtoken";
import pool from "../db.js";

const SECRET = process.env.JWT_SECRET || "medirun-dev-secret";

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const { userId } = jwt.verify(token, SECRET);
    const { rows } = await pool.query("SELECT id,name,phone,role,address FROM users WHERE id=$1", [userId]);
    if (!rows[0]) return res.status(401).json({ error: "User not found" });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
