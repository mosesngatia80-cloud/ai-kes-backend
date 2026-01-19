require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   DATABASE (POSTGRES)
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   PLAN LIMITS
========================= */
const PLAN_LIMITS = {
  free: 5,
  basic: 100,
  pro: 1000 // soft infinity
};

/* =========================
   OPENAI CLIENT
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   AUTH MIDDLEWARE
========================= */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Missing token" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("AI KES APP API RUNNING 🚀 (DB MODE)");
});

/* =========================
   REGISTER
========================= */
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  const existing = await pool.query(
    "SELECT id FROM users WHERE email=$1",
    [email]
  );
  if (existing.rows.length > 0)
    return res.status(400).json({ message: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);

  await pool.query(
    "INSERT INTO users (email, password) VALUES ($1,$2)",
    [email, hashed]
  );

  res.json({ message: "User registered (DB-backed)" });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query(
    "SELECT id, password FROM users WHERE email=$1",
    [email]
  );

  if (result.rows.length === 0)
    return res.status(401).json({ message: "Invalid credentials" });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* =========================
   MANUAL UPGRADE (ADMIN)
========================= */
app.post("/api/upgrade", async (req, res) => {
  const { email, plan } = req.body;
  const validPlans = ["free", "basic", "pro"];
  if (!validPlans.includes(plan))
    return res.status(400).json({ message: "Invalid plan" });

  const result = await pool.query(
    "UPDATE users SET plan=$1, messages_used=0 WHERE email=$2 RETURNING email, plan",
    [plan, email]
  );

  if (result.rowCount === 0)
    return res.status(404).json({ message: "User not found" });

  res.json({
    message: `User upgraded to ${plan}`,
    user: result.rows[0]
  });
});

/* =========================
   CHAT (DB + PLAN AWARE)
========================= */
app.post("/api/chat", auth, async (req, res) => {
  const { message } = req.body;

  const result = await pool.query(
    "SELECT id, plan, messages_used FROM users WHERE id=$1",
    [req.user.id]
  );

  if (result.rows.length === 0)
    return res.status(401).json({ message: "User not found" });

  const user = result.rows[0];
  const limit = PLAN_LIMITS[user.plan] ?? 5;

  if (user.messages_used >= limit) {
    return res.status(403).json({
      message: "Free limit reached. Upgrade to continue.",
      plan: user.plan,
      limit
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly, concise assistant for students, hustlers, and small businesses in Kenya."
        },
        { role: "user", content: message }
      ]
    });

    await pool.query(
      "UPDATE users SET messages_used = messages_used + 1 WHERE id=$1",
      [user.id]
    );

    res.json({
      reply: completion.choices[0].message.content,
      messagesLeft:
        limit === Infinity ? "unlimited" : limit - (user.messages_used + 1),
      plan: user.plan
    });
  } catch (err) {
    console.error("AI ERROR:", err.message);
    res.status(500).json({ message: "AI service error" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
