require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.send("AI KES APP API RUNNING 🚀 (PostgreSQL connected)");
  } catch (err) {
    res.status(500).send("DB connection failed");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
