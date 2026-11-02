/**
 * Rôles et permissions de la plateforme.
 *
 * - admin                 : superuser technique
 * - president             : président élu du club
 * - secretaire_generale   : contrôle TOTAL sur le programme (créer, éditer, publier)
 * - instructor            : chef de pôle (propose, gère son pôle)
 * - co-instructor         : adjoint de pôle
 * - student               : membre simple
 */

const ROLES = {
  ADMIN: "admin",
  PRESIDENT: "president",
  SECRETAIRE_GENERALE: "secretaire_generale",
  INSTRUCTOR: "instructor",
  CO_INSTRUCTOR: "co-instructor",
  STUDENT: "student",
};

const ALL_ROLES = Object.values(ROLES);

const PERMISSIONS = {
  [ROLES.ADMIN]: ["*"],

  [ROLES.PRESIDENT]: [
    "user:read_all", "user:read_one", "user:read_own",
    "user:update_role", "user:deactivate", "user:restore", "user:hard_delete", "user:trash",
    "workshop:read_all", "workshop:read_own", "workshop:read_available",
    "workshop:create", "workshop:update_all", "workshop:update_own",
    "workshop:delete", "workshop:join", "workshop:leave",
    "student:accept", "student:reject", "student:read_all", "student:read_own",
    "session:read", "session:read_own", "session:read_enrolled",
    "session:create", "session:create_own",
    "session:update", "session:update_own",
    "session:delete", "session:delete_own",
    "attendance:read_all", "attendance:read_own",
    "attendance:manage", "attendance:manage_own",
    "grade:read_all", "grade:read_own",
    "grade:manage", "grade:manage_own",
    "settings:manage",
    // Programme
    "schedule:read_all", "schedule:create", "schedule:update", "schedule:publish", "schedule:delete",
    // Orientation / Transferts
    "transfer:request", "transfer:approve_source", "transfer:approve_destination",
    "transfer:force", "transfer:recalibrate",
    "orientation:create", "orientation:read_own", "orientation:read_all", "orientation:cancel",
  ],

  [ROLES.SECRETAIRE_GENERALE]: [
    "user:read_own",
    // Programme = contrôle TOTAL
    "schedule:read_all", "schedule:create", "schedule:update", "schedule:publish", "schedule:delete",
    "schedule:read_own", // car elle peut avoir des pôles (rare)
    // Consultations
    "workshop:read_all", "workshop:read_own",
    // Orientation / Transferts (lecture)
    "orientation:read_all",
    "grade:read_all",
  ],

  [ROLES.INSTRUCTOR]: [
    "user:read_own",
    "workshop:read_own", "workshop:update_own",
    "workshop:join", "workshop:leave",
    "student:read_own", "student:accept", "student:reject",
    "session:read", "session:read_own", "session:read_enrolled",
    "session:create_own", "session:update_own", "session:delete_own",
    "attendance:read_own", "attendance:manage_own",
    "grade:read_own", "grade:manage_own",
    // Programme : PROPOSE seulement
    "schedule:propose",
    "schedule:read_own",
    // Transferts : chef source + destination
    "transfer:approve_source", "transfer:approve_destination",
    "orientation:read_own",
  ],

  [ROLES.CO_INSTRUCTOR]: [
    "user:read_own",
    "workshop:read_own", "workshop:update_own",
    "workshop:join", "workshop:leave",
    "student:read_own",
    "session:read", "session:read_own", "session:read_enrolled",
    "session:update_own",
    "attendance:read_own", "attendance:manage_own",
    "grade:read_own",
    // Programme : PROPOSE seulement
    "schedule:propose",
    "schedule:read_own",
    "orientation:read_own",
  ],

  [ROLES.STUDENT]: [
    "user:read_own",
    "workshop:read_available", "workshop:read_own",
    "workshop:join", "workshop:leave",
    "session:read_enrolled",
    "attendance:read_own",
    "grade:read_own",
    // Orientation
    "orientation:create", "orientation:read_own", "orientation:cancel",
    // Transferts
    "transfer:request",
  ],
};

const hasPermission = (role, permission) => {
  const perms = PERMISSIONS[role] || [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
};

/* ─────────── Enums métier stables ─────────── */

const WORKSHOP_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  EXCUSED: "excused",
};

const ENROLLMENT_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  DROPPED: "dropped",
  TRANSFERRED_OUT: "transferred_out",
};

const ASSESSMENT_TYPE = {
  DEVOIR: "devoir",
  EXAMEN: "examen",
  PROJECT: "project",
  PARTICIPATION: "participation",
  BONUS: "bonus",
};

const ORIENTATION_STATUS = {
  PENDING: "pending",
  FULFILLED: "fulfilled",
  CANCELLED: "cancelled",
  OVERRIDDEN: "overridden",
};

const SCHEDULE_STATUS = {
  PROPOSED: "proposed",
  DRAFT: "draft",
  PUBLISHED: "published",
};

const DEFAULT_MAX_WORKSHOPS_PER_USER = 3;

module.exports = {
  ROLES,
  ALL_ROLES,
  PERMISSIONS,
  hasPermission,
  WORKSHOP_STATUS,
  ATTENDANCE_STATUS,
  ENROLLMENT_STATUS,
  ASSESSMENT_TYPE,
  ORIENTATION_STATUS,
  SCHEDULE_STATUS,
  DEFAULT_MAX_WORKSHOPS_PER_USER,
};