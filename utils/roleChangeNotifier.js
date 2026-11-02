/**
 * Mécanisme en mémoire pour notifier un utilisateur que son rôle a changé.
 * Perdu au restart serveur — acceptable : le client finit par se re-logger.
 */

const pendingRoleChanges = new Map();

const notifyRoleChange = (userId, newRole, oldRole) => {
  pendingRoleChanges.set(String(userId), {
    newRole,
    oldRole,
    timestamp: Date.now(),
  });
};

const getPendingRoleChange = (userId) => {
  return pendingRoleChanges.get(String(userId)) || null;
};

const clearPendingRoleChange = (userId) => {
  pendingRoleChanges.delete(String(userId));
};

module.exports = {
  notifyRoleChange,
  getPendingRoleChange,
  clearPendingRoleChange,
};