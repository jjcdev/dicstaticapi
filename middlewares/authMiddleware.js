const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { ROLES } = require("../utils/constants");

/**
 * Middleware principal : n'accepte plus que les User (UUID).
 * Attache req.user (instance Sequelize User).
 *
 * Si le token est valide mais pointe vers un ID non-UUID,
 * il est rejeté (tokens émis avant migration → re-login requis).
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token manquant." });
    }

    const token = header.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Token invalide ou expiré." });
    }

    // Seuls les UUID (string) sont acceptés désormais
    if (typeof decoded.id !== "string") {
      return res.status(401).json({
        message: "Session obsolète. Veuillez vous reconnecter.",
      });
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "Compte introuvable." });
    }
    if (!user.is_active) {
      return res.status(401).json({ message: "Compte désactivé." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide ou expiré." });
  }
};

/**
 * Exige un rôle `admin`.
 * Utilisé par toutes les routes admin (site vitrine inclus).
 */
const protectAdmin = (req, res, next) => {
  protect(req, res, (err) => {
    if (err) return next(err);
    if (!req.user || req.user.role !== ROLES.ADMIN) {
      return res
        .status(403)
        .json({ message: "Accès refusé — administrateur requis." });
    }
    next();
  });
};

/**
 * Exige au moins un des rôles listés.
 * `admin` est toujours autorisé (superuser).
 */
const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non authentifié." });
    }
    if (req.user.role === ROLES.ADMIN) return next();
    if (allowedRoles.includes(req.user.role)) return next();
    return res.status(403).json({ message: "Accès refusé." });
  };

module.exports = { protect, protectAdmin, requireRole };