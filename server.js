require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

async function initDB() {
  console.log("Starting DB init...");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is NOT set");
  }

  // Log host only (safe)
  const host = process.env.DATABASE_URL.split("@")[1]?.split("/")[0];
  console.log("DB host:", host);

  await pool.query("SELECT 1");
  console.log("PostgreSQL connected");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      messages_left INTEGER DEFAULT 0,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Users table ready");
}

app.get("/", (req, res) => {
  res.send("AI KES APP API RUNNING 🚀");
});

(async () => {
  try {
    await initDB();
  } catch (err) {
    console.error("FATAL DB ERROR:", err.message);
    process.exit(1); // crash so Render shows the error
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
