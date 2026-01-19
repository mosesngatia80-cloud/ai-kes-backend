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
   IN-MEMORY USERS
========================= */
const users = [];

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
  res.send("AI KES APP API RUNNING 🚀 (OPENAI MODE)");
});

/* =========================
   REGISTER
========================= */
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required" });

  if (users.find(u => u.email === email))
    return res.status(400).json({ message: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  users.push({
    email,
    password: hashed,
    messagesLeft: 5,
  });

  res.json({ message: "User registered" });
});

/* =========================
   LOGIN
========================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* =========================
   CHAT (REAL AI)
========================= */
app.post("/api/chat", auth, async (req, res) => {
  const { message } = req.body;
  const user = users.find(u => u.email === req.user.email);

  if (!user) return res.status(401).json({ message: "User not found" });
  if (user.messagesLeft <= 0)
    return res.status(403).json({ message: "Usage limit reached" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a friendly helpful assistant." },
        { role: "user", content: message }
      ],
    });

    user.messagesLeft -= 1;

    res.json({
      reply: completion.choices[0].message.content,
      messagesLeft: user.messagesLeft,
    });
  } catch (err) {
    console.error("OPENAI ERROR:", err);
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
