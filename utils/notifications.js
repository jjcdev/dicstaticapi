const NOTIF_TYPES = {
  TRANSFER_REQUESTED: "transfer_requested",
  TRANSFER_SOURCE_ACCEPTED: "transfer_source_accepted",
  TRANSFER_SOURCE_REJECTED: "transfer_source_rejected",
  TRANSFER_DESTINATION_ACCEPTED: "transfer_destination_accepted",
  TRANSFER_DESTINATION_REJECTED: "transfer_destination_rejected",
  TRANSFER_FORCED: "transfer_forced",
  TRANSFER_CANCELLED: "transfer_cancelled",
  ORIENTATION_FULFILLED: "orientation_fulfilled",
  SCHEDULE_PROPOSED: "schedule_proposed",
  SCHEDULE_PUBLISHED: "schedule_published",
  RECALIBRATION_BULK_DONE: "recalibration_bulk_done",
};

const queue = new Map();

const push = (userId, type, data = {}) => {
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
  queue.set(key, list.slice(-100));
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