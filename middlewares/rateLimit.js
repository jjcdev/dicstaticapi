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

exports.loginLimiter = makeLimiter(
  15 * 60 * 1000,
  10,
  "Trop de tentatives de connexion. Réessayez dans 15 minutes."
);

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