/**
 * Notifications in-app en mémoire (perdues au restart — MVP).
 * Persistance DB prévue plus tard.
 */

const NOTIF_TYPES = {
  // Transferts
  TRANSFER_REQUESTED: "transfer_requested",
  TRANSFER_SOURCE_ACCEPTED: "transfer_source_accepted",
  TRANSFER_SOURCE_REJECTED: "transfer_source_rejected",
  TRANSFER_DESTINATION_ACCEPTED: "transfer_destination_accepted",
  TRANSFER_DESTINATION_REJECTED: "transfer_destination_rejected",
  TRANSFER_FORCED: "transfer_forced",
  TRANSFER_CANCELLED: "transfer_cancelled",

  // Orientations
  ORIENTATION_FULFILLED: "orientation_fulfilled",

  // Planning
  SCHEDULE_PROPOSED: "schedule_proposed",
  SCHEDULE_PUBLISHED: "schedule_published",
  SCHEDULE_REJECTED: "schedule_rejected",

  // Recalage
  RECALIBRATION_BULK_DONE: "recalibration_bulk_done",

  // Inscriptions (nouveaux)
  ENROLLMENT_REQUESTED: "enrollment_requested",
  ENROLLMENT_ACCEPTED: "enrollment_accepted",
  ENROLLMENT_REJECTED: "enrollment_rejected",

  // Retrait d'un membre (nouveau)
  MEMBER_REMOVED: "member_removed",
};

const queue = new Map(); // userId(string) -> notification[]

const push = (userId, type, data = {}) => {
  if (!userId) return null;
  const key = String(userId);
  const notif = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    data,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const list = queue.get(key) || [];
  list.push(notif);
  queue.set(key, list.slice(-100)); // max 100 par user
  return notif;
};

const getAll = (userId) => queue.get(String(userId)) || [];

const markAllRead = (userId) => {
  const key = String(userId);
  const list = queue.get(key) || [];
  list.forEach((n) => {
    n.read = true;
  });
  queue.set(key, list);
  return list;
};

const unreadCount = (userId) =>
  getAll(userId).filter((n) => !n.read).length;

module.exports = {
  NOTIF_TYPES,
  push,
  getAll,
  markAllRead,
  unreadCount,
};