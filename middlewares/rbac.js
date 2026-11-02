const { hasPermission, ROLES } = require("../utils/constants");

/**
 * Vérifie que req.user possède AU MOINS UNE des permissions listées.
 * (logique OU — pas ET)
 *
 * Usage : router.get('/x', protect, authorize('user:read_all'), ctrl.x)
 */
const authorize =
  (...requiredPermissions) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non authentifié." });
    }
    const role = req.user.role;
    const ok = requiredPermissions.some((perm) => hasPermission(role, perm));
    if (!ok) {
      return res.status(403).json({ message: "Permissions insuffisantes." });
    }
    next();
  };

/**
 * Vérifie que l'utilisateur agit sur SA propre ressource.
 * `field` = nom du paramètre URL contenant l'id cible.
 *
 * - admin : toujours autorisé
 * - sinon : req.user.id doit === req.params[field]
 */
const requireSelfOrAdmin =
  (field = "id") =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Non authentifié." });
    }
    if (req.user.role === ROLES.ADMIN) return next();
    if (String(req.user.id) === String(req.params[field])) return next();
    return res.status(403).json({ message: "Accès refusé." });
  };

/**
 * Raccourci : président OU admin uniquement.
 */
const isPresident = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Non authentifié." });
  }
  if (
    req.user.role === ROLES.ADMIN ||
    req.user.role === ROLES.PRESIDENT
  ) {
    return next();
  }
  return res.status(403).json({ message: "Réservé au président." });
};

/**
 * NOTE : `isWorkshopOwner` et `isAssessmentOwner` seront ajoutés
 * au Block 5, quand les modèles Workshop/Assessment existeront.
 */

module.exports = {
  authorize,
  requireSelfOrAdmin,
  isPresident,
};