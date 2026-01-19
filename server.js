require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   IN-MEMORY USERS (TEMP)
   Day 8 → DB persistence
========================= */
const users = [];

/* =========================
   FREE PLAN LIMIT
========================= */
const FREE_LIMIT = 10;

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
  if (!header) {
    return res.status(401).json({ message: "Missing token" });
  }

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
  res.send("AI KES APP API RUNNING 🚀 (UNLIMITED FAIR USE MODE)");
});

/* =========================
   REGISTER
========================= */
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashed = await bcrypt.hash(password, 10);

  users.push({
    email,
    password: hashed,
    plan: "free",
    messagesUsed: 0,
  });

  res.json({
    message: "User registered",
    plan: "free",
    freeMessages: FREE_LIMIT,
  });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, plan: user.plan });
});

/* =========================
   MANUAL UPGRADE (TEMP)
========================= */
app.post("/api/upgrade", (req, res) => {
  const { email, plan } = req.body;
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!["basic", "pro"].includes(plan)) {
    return res.status(400).json({ message: "Invalid plan" });
  }

  user.plan = plan;
  res.json({ message: "User upgraded", email, plan });
});

/* =========================
   CHAT (FAIR USE LOGIC)
========================= */
app.post("/api/chat", auth, async (req, res) => {
  const { message } = req.body;
  const user = users.find(u => u.email === req.user.email);

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  // FREE PLAN HARD LIMIT
  if (user.plan === "free" && user.messagesUsed >= FREE_LIMIT) {
    return res.status(403).json({
      message: "Free limit reached. Upgrade to continue.",
      plan: "free",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly, clear, and practical assistant for Kenyan users. Keep answers helpful and concise."
        },
        { role: "user", content: message }
      ],
      // COST CONTROL (VERY IMPORTANT)
      max_tokens: user.plan === "pro" ? 600 : 300,
    });

    user.messagesUsed += 1;

    const response = {
      reply: completion.choices[0].message.content,
      plan: user.plan,
    };

    // ONLY SHOW COUNT FOR FREE USERS
    if (user.plan === "free") {
      response.messagesLeft = FREE_LIMIT - user.messagesUsed;
    }

    res.json(response);
  } catch (err) {
    console.error("OPENAI ERROR:", err.message);
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
