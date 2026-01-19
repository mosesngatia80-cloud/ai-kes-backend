require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const auth = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

// IN-MEMORY USERS
const users = [];

// ROOT
app.get("/", (req, res) => {
  res.send("AI KES APP API RUNNING 🚀 (NO DB MODE)");
});

// REGISTER
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
    messagesLeft: 5 // FREE TRIAL
  });

  res.json({ message: "User registered" });
});

// LOGIN
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
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// CHAT (PROTECTED)
app.post("/api/chat", auth, (req, res) => {
  const { message } = req.body;
  const user = users.find(u => u.email === req.user.email);

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  if (user.messagesLeft <= 0) {
    return res.status(403).json({ message: "Usage limit reached. Please subscribe." });
  }

  user.messagesLeft -= 1;

  // PLACEHOLDER AI RESPONSE
  const reply = `🤖 AI says: I received your message — "${message}"`;

  res.json({
    reply,
    messagesLeft: user.messagesLeft
  });
});

// START SERVER
const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
