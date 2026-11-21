const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const authRoutes = require("./routes/auth");
const videoRoutes = require("./routes/videos");
const studyRoutes = require("./routes/study");

const app = express();

if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
  console.error("Set MONGODB_URI and SESSION_SECRET in your .env file.");
  process.exit(1);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: "studymate.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", (req, res) => res.json({ success: true, message: "AI StudyMate is running" }));
app.use("/api/auth", authRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/study", studyRoutes);
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const port = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(port, () => console.log(`AI StudyMate running at http://localhost:${port}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
