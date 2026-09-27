"use strict";
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const url = process.env.DATABASE_URL || "postgres://djh:djh@localhost:5432/djh";
const ssl = /sslmode=require/.test(url) || process.env.PGSSL === "1" ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString: url, ssl, max: 10 });

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "001_init.sql"), "utf8");
  await pool.query(sql);
}
const q = (text, params) => pool.query(text, params);
async function audit(userId, action, target) {
  try { await q("INSERT INTO audit_events(user_id, action, target) VALUES ($1,$2,$3)", [userId || null, action, target || null]); }
  catch (e) { console.error("audit failed", e.message); }
}
module.exports = { pool, q, migrate, audit };
