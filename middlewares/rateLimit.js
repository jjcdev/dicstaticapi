const rateLimit = require("express-rate-limit");

/**
 * Wrapper avec désactivation des validations bruyantes.
 * Les vraies vérifications de sécurité sont faites ailleurs :
 *   - trust proxy configuré via TRUST_PROXY (app.js)
 *   - keyGenerator par défaut = req.ip (suffisant pour Render)
 */
const makeLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    // Désactive les warnings de validation bruyants
    validate: {
      xForwardedForHeader: false,
      trustProxy: false,
      ip: false,
      default: false,
    },
  });

// middlewares/rateLimit.js — remplacer loginLimiter
exports.loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // large : 100 tentatives / 15 min / IP (anti-DoS)
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives depuis cette IP. Réessayez dans 15 min." },
  validate: { xForwardedForHeader: false, trustProxy: false, ip: false, default: false },
});

exports.loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // strict : 10 tentatives / 15 min / email (anti-brute-force)
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Trop de tentatives sur ce compte. Réessayez dans 15 min." },
  keyGenerator: (req) => {
    const email = String(req.body?.email || "").toLowerCase().trim();
    return email ? `login:${email}` : `login:anon:${req.ip}`;
  },
  validate: { xForwardedForHeader: false, trustProxy: false, ip: false, default: false },
});

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