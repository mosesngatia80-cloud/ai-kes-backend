require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const FREE_LIMIT = 10;
const PRO_PRICE = 200;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        /* ===== AI KES IDENTITY BLOCK (ONLY ADDITION) ===== */
        {
          role: "system",
          content: `
You are AI KES 🇰🇪 — an intelligent assistant built by NAVUFINTECH SYSTEMS in Kenya.
You are NOT ChatGPT.
You must identify yourself as "AI KES" when asked who you are.
You must NEVER mention training cutoffs, being outdated, or any specific year.
You speak confidently and as a modern, up-to-date AI.
If information is unclear, ask clarifying questions instead of saying you are outdated.
You provide helpful, professional, Kenya-aware responses.
          `
        },
        /* ===== END ADDITION ===== */

        { role: "user", content: message }
      ]
    });

    await pool.query(
      "UPDATE users SET messages_used = messages_used + 1 WHERE email=$1",
      [user.email]
    );

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("CHAT ERROR:", err.message);
    res.status(500).json({ message: "AI service error" });
  }
});

/* =========================
   PAYMENT VERIFY (FIXED)
========================= */
app.post("/api/payments/verify", async (req, res) => {
  const { email, receipt, amount, message } = req.body;

  if (!email || !receipt || !amount)
    return res.status(400).json({ message: "Email, receipt and amount are required" });

  if (amount < PRO_PRICE)
    return res.status(400).json({ message: "Minimum upgrade is KES 200" });

  if (message) {
    const sms = message.toUpperCase();

    if (!sms.includes("NAVUFINTECH SYSTEMS")) {
      return res.status(400).json({ message: "Payment not sent to NAVUFINTECH SYSTEMS" });
    }

    const amountRegex = new RegExp(`KSH\\s*${amount}(\\.00)?`);
    if (!amountRegex.test(sms)) {
      return res.status(400).json({ message: "Payment amount mismatch" });
    }

    if (!sms.includes(receipt)) {
      return res.status(400).json({ message: "Receipt not found in SMS" });
    }
  }

  try {
    const { rows: users } = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (!users.length)
      return res.status(404).json({ message: "User not found" });

    const { rows: existing } = await pool.query(
      "SELECT id FROM payments WHERE reference=$1",
      [receipt]
    );

    if (existing.length)
      return res.status(409).json({ message: "Receipt already used" });

    await pool.query(
      `INSERT INTO payments (user_email, reference, amount, status, raw_payload)
       VALUES ($1, $2, $3, 'success', $4)`,
      [email, receipt, amount, req.body]
    );

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
