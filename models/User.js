const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  plan: {
    type: String,
    default: "free"
  },
  messagesLeft: {
    type: Number,
    default: 0
  },
  expiresAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
