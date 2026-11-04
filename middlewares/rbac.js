const { hasPermission, ROLES } = require("../utils/constants");

/**
 * Vérifie que req.user possède AU MOINS UNE des permissions listées.
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
 * Président OU admin uniquement (legacy — utiliser SUPERUSER_ROLES de préférence).
 */
const isPresident = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Non authentifié." });
  }
  if ([ROLES.ADMIN, ROLES.PRESIDENT].includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ message: "Réservé au président." });
};

/**
 * Chef du pôle UNIQUEMENT (pas l'adjoint).
 * Utilisé pour : accepter/refuser inscriptions, créer/modifier éval, saisir notes.
 *
 * @param {User} user - req.user
 * @param {Workshop} workshop - instance Workshop
 */
const isWorkshopOwnerOnly = (user, workshop) => {
  if (!user || !workshop) return false;
  return workshop.instructor_id === user.id;
};

/**
 * Chef OU adjoint du pôle.
 * Utilisé pour : config pondérations, bonus, lecture bordereau, lecture demandes.
 *
 * @param {User} user - req.user
 * @param {Workshop} workshop - instance Workshop
 */
const isWorkshopManager = (user, workshop) => {
  if (!user || !workshop) return false;
  return (
    workshop.instructor_id === user.id ||
    workshop.co_instructor_id === user.id
  );
};

/**
 * Superuser (admin/president/VP) OU chef/adjoint du pôle.
 */
const isSuperuserOrWorkshopManager = (user, workshop) => {
  if (!user || !workshop) return false;
  if ([ROLES.ADMIN, ROLES.PRESIDENT, ROLES.VICE_PRESIDENT].includes(user.role)) {
    return true;
  }
  return isWorkshopManager(user, workshop);
};

module.exports = {
  authorize,
  requireSelfOrAdmin,
  isPresident,
  isWorkshopOwnerOnly,
  isWorkshopManager,
  isSuperuserOrWorkshopManager,
};