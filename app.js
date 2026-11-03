require("./config/env");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { frontendOrigins } = require("./config/env");
const errorHandler = require("./middlewares/errorHandler");
const { stripProtoKeys } = require("./utils/sanitize");
const AppError = require("./utils/AppError");

const app = express();

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.set("query parser", "simple");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// app.use(
//   cors({
//     origin: (origin, cb) => {
//       if (!origin) return cb(null, true);
//       if (frontendOrigins.includes(origin)) return cb(null, true);
//       return cb(new AppError("Origine CORS non autorisée.", 403));
//     },
//     credentials: false,
//   })
// );
// ⚠️ TEMPORAIRE : accepte toutes les origines (à reconfigurer en whitelist)
// Pour revivre la whitelist : décommenter le bloc ci-dessous et supprimer cors()
app.use(cors());

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

app.use((req, _res, next) => {
  if (req.body) stripProtoKeys(req.body);
  next();
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes. Réessayez dans une minute." },
  validate: {
    xForwardedForHeader: false,
    trustProxy: false,
    ip: false,
    default: false,
  },
});
app.use("/api", globalLimiter);

/* ─── Auth + Vitrine ─── */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/academic-years", require("./routes/academicYearRoutes"));
app.use("/api/members", require("./routes/memberRoutes"));
app.use("/api/gallery", require("./routes/galleryRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/rules", require("./routes/ruleRoutes"));
app.use("/api/phone-prefixes", require("./routes/phonePrefixRoutes"));
app.use("/api/program", require("./routes/programRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

/* ─── Gestion club ─── */
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/workshops", require("./routes/workshopRoutes"));
app.use("/api/gradebook", require("./routes/gradebookRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));

/* ─── Orientation / Transferts / Programme ─── */
app.use("/api/orientations", require("./routes/orientationRoutes"));
app.use("/api/recalibrate", require("./routes/recalibrateRoutes"));
app.use("/api/transfers", require("./routes/transferRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/public/schedules", require("./routes/publicScheduleRoutes"));
app.use("/api/schedules", require("./routes/scheduleRoutes"));

/* ─── Rapports ─── */
app.use("/api/reports", require("./routes/reportRoutes"));

/* ─── Frontend statique (bureau, règlement, autres pages) ─── */
const FRONTEND_DIST = process.env.FRONTEND_DIST_PATH
  ? path.resolve(process.env.FRONTEND_DIST_PATH)
  : path.join(__dirname, "..", "frontend", "dist");

app.use(express.static(FRONTEND_DIST));

/**
 * Catch-all SPA : intercepte toutes les routes NON-API et renvoie index.html.
 * Le negative lookahead (?!api\/) garantit que /api/* n'est jamais intercepté.
 */
app.get(/^\/(?!api(\/|$)).*/, (_req, res, next) => {
  const indexPath = path.join(FRONTEND_DIST, "index.html");

  if (!fs.existsSync(indexPath)) {
    // Build absent (dev sans npm run build) → fallback JSON clair
    return res.status(200).json({
      message:
        "API DIC fonctionnelle. Frontend non disponible (build manquant).",
      api: "/api",
    });
  }

  res.sendFile(indexPath, (err) => {
    if (err) next(err);
  });
});

/* ─── 404 API (routes /api/* non matchées) ─── */
app.use((req, res) => {
  res.status(404).json({
    message: "Route introuvable.",
    requestId: crypto.randomUUID(),
  });
});

app.use(errorHandler);

module.exports = app;