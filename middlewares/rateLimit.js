const rateLimit = require("express-rate-limit");

/**
 * Wrapper avec désactivation des validations bruyantes.
 * Render/Heroku envoient X-Forwarded-For, mais trust proxy est bien configuré.
 * Les rate-limits restent pleinement actifs.
 */
const makeLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    validate: {
      xForwardedForHeader: false,
      trustProxy: false,
      ip: false,
      default: false,
    },
  });

/* ─────────── Auth ─────────── */

/**
 * Limiteur par IP (large : 100 / 15 min).
 * Évite les DoS, mais ne bloque pas les campus WiFi (30 étudiants même IP).
 */
exports.loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives depuis cette IP. Réessayez dans 15 minutes." },
  validate: {
    xForwardedForHeader: false,
    trustProxy: false,
    ip: false,
    default: false,
  },
});

/**
 * Limiteur par email (strict : 10 / 15 min).
 * Anti-brute-force par compte. Chaque email = compteur indépendant.
 */
exports.loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives sur ce compte. Réessayez dans 15 minutes." },
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").toLowerCase().trim();
    return email ? `login:${email}` : `login:anon:${req.ip}`;
  },
  validate: {
    xForwardedForHeader: false,
    trustProxy: false,
    ip: false,
    default: false,
  },
});

/**
 * Alias rétrocompat : si un fichier importe encore `loginLimiter`,
 * il fonctionnera (équivalent à `loginIpLimiter`).
 */
exports.loginLimiter = exports.loginIpLimiter;

/* ─────────── Autres modules ─────────── */

exports.applicationIpLimiter = makeLimiter(
  60 * 60 * 1000,
  10,
  "Trop de candidatures depuis cette IP. Réessayez plus tard."
);

exports.contactLimiter = makeLimiter(
  60 * 60 * 1000,
  10,
  "Trop de messages envoyés. Réessayez plus tard."
);

exports.programPublicLimiter = makeLimiter(
  60 * 1000,
  120,
  "Trop de requêtes. Réessayez dans une minute."
);
exports.scanLimiter = makeLimiter(
  60 * 1000,
  100,
  "Trop de scans. Réessayez dans une minute."
);