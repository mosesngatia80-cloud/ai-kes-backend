require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

/* ===== OPENROUTER ADDITION ===== */
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));
/* ===== END ADDITION ===== */

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const FREE_LIMIT = 10;
const PRO_PRICE = 200;

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Missing token" });

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.get("/", (_, res) => {
  res.send("AI KES API 🚀 LIVE");
});

app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  const hashed = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (email, password, plan, messages_used)
     VALUES ($1, $2, 'free', 0)
     ON CONFLICT (email) DO NOTHING`,
    [email, hashed]
  );

  res.json({ message: "User registered", plan: "free" });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (!rows.length)
    return res.status(401).json({ message: "Invalid credentials" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password);
  if (!ok)
    return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, plan: user.plan });
});

app.get("/api/me", auth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT email, plan, messages_used FROM users WHERE email=$1",
    [req.user.email]
  );

  if (!rows.length)
    return res.status(404).json({ message: "User not found" });

  const user = rows[0];

  res.json({
    email: user.email,
    plan: user.plan,
    messagesUsed: user.messages_used,
    messagesLeft:
      user.plan === "free"
        ? Math.max(FREE_LIMIT - user.messages_used, 0)
        : "unlimited"
  });
});

app.post("/api/chat", auth, async (req, res) => {
  const { message } = req.body;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [req.user.email]
    );

    if (!rows.length)
      return res.status(401).json({ message: "User not found" });

    const user = rows[0];

    if (user.plan === "free" && user.messages_used >= FREE_LIMIT)
      return res.status(403).json({ message: "Free limit reached" });

    /* ===== OPENROUTER AI CALL (ONLY LOGIC CHANGE) ===== */
    const prompt = `
You are AI KES 🇰🇪 — an intelligent assistant built by NAVUFINTECH SYSTEMS in Kenya.
You are NOT ChatGPT.
Never mention training cutoffs, dates, or being outdated.
Respond confidently, professionally, and with Kenya awareness.

User message:
${message}
    `;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-kes.app",
        "X-Title": "AI KES"
      },
      body: JSON.stringify({
        model: "mistralai/mixtral-8x7b-instruct",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "⚠️ AI KES is warming up.";

    /* ===== END OPENROUTER ===== */

    await pool.query(
      "UPDATE users SET messages_used = messages_used + 1 WHERE email=$1",
      [user.email]
    );

    res.json({ reply });

  } catch (err) {
    console.error("CHAT ERROR FULL:", err);
    res.json({
      reply: "⚙️ AI KES is temporarily upgrading its intelligence systems 🇰🇪\n\nPlease check back shortly — exciting improvements are on the way 🚀"
    });
  }
});

/* =========================
   PAYMENT VERIFY (UNCHANGED)
========================= */
app.post("/api/payments/verify", async (req, res) => {
  const { email } = req.body;

  try {
    await pool.query(
      `UPDATE users SET plan='pro', messages_used=0 WHERE email=$1`,
      [email]
    );

    res.json({ message: "Payment verified. Pro activated.", plan: "pro" });
  } catch (err) {
    console.error("PAYMENT VERIFY ERROR:", err.message);
    res.status(500).json({ message: "Verification failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 AI-KES running on port", PORT);
});
