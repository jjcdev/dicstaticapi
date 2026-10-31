require("./config/env");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { frontendOrigins } = require("./config/env");
const errorHandler = require("./middlewares/errorHandler");
const { stripProtoKeys } = require("./utils/sanitize");

const app = express();

app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
// Force le parseur simple (querystring) → pas de nesting qs, pas d'opérateurs injectables
app.set("query parser", "simple");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (frontendOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Origine CORS non autorisée."));
    },
    credentials: false,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// Strip __proto__/constructor/prototype de tout body (défense en profondeur)
app.use((req, _res, next) => {
  if (req.body) stripProtoKeys(req.body);
  next();
});

// Health check AVANT le rate-limit global (monitoring exempté)
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Rate-limit global de secours (300 req/min/IP) — les limiteurs spécifiques
// sur login/applications/contact/program sont plus stricts et s'ajoutent.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de requêtes. Réessayez dans une minute." },
});
app.use("/api", globalLimiter);

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

// 404 homogène avec requestId (anti-énumération de routes)
app.use((_req, res) =>
  res.status(404).json({
    message: "Route introuvable.",
    requestId: crypto.randomUUID(),
  })
);

app.use(errorHandler);

module.exports = app;