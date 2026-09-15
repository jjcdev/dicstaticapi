const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(
  cors({
    origin:"*",
    credentials: false,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/academic-years", require("./routes/academicYearRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/gallery", require("./routes/galleryRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

app.use((_req, res) => res.status(404).json({ message: "Route introuvable." }));

app.use(errorHandler);

module.exports = app;