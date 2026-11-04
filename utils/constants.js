/**
 * Rôles et permissions de la plateforme MyDIC.
 *
 * Hiérarchie :
 *   - admin                 : superuser technique
 *   - president             : président élu
 *   - vice_president        : mêmes pouvoirs qu'admin (sauf changement de rôle)
 *   - secretaire_generale   : contrôle du programme (publier/rejeter)
 *   - secretaire_adjoint    : mêmes pouvoirs que SG sur le programme
 *   - coordinateur_general  : surveille les pôles, peut retirer des membres
 *   - responsable_communication : lecture rapports uniquement
 *   - instructor            : chef de pôle
 *   - co-instructor         : adjoint de pôle
 *   - student               : membre simple (défaut)
 *
 * Règle : un user a UN rôle "principal" + des inscriptions étudiantes
 * dans des pôles (0 ou 1 active à la fois). Un chef peut être inscrit
 * comme étudiant dans un autre pôle.
 */

const ROLES = {
  ADMIN: "admin",
  PRESIDENT: "president",
  VICE_PRESIDENT: "vice_president",
  SECRETAIRE_GENERALE: "secretaire_generale",
  SECRETAIRE_ADJOINT: "secretaire_adjoint",
  COORDINATEUR_GENERAL: "coordinateur_general",
  RESPONSABLE_COMMUNICATION: "responsable_communication",
  INSTRUCTOR: "instructor",
  CO_INSTRUCTOR: "co-instructor",
  STUDENT: "student",
};

const ALL_ROLES = Object.values(ROLES);

/**
 * Superusers : accès quasi-total (sauf changement de rôle réservé à admin).
 */
const SUPERUSER_ROLES = [
  ROLES.ADMIN,
  ROLES.PRESIDENT,
  ROLES.VICE_PRESIDENT,
];

/**
 * Rôles "programme" : contrôle du planning (publier + rejeter).
 */
const SCHEDULE_MANAGER_ROLES = [
  ROLES.SECRETAIRE_GENERALE,
  ROLES.SECRETAIRE_ADJOINT,
];

/**
 * Permissions granulaires par rôle.
 * "*" = wildcard (admin uniquement).
 */
const PERMISSIONS = {
  [ROLES.ADMIN]: ["*"],

  [ROLES.PRESIDENT]: [
    // Users
    "user:read_all", "user:read_one", "user:read_own",
    "user:deactivate", "user:restore", "user:hard_delete", "user:trash",
    // (pas de user:update_role — admin seul)

    // Workshops
    "workshop:read_all", "workshop:read_own", "workshop:read_available",
    "workshop:create", "workshop:update_all", "workshop:update_own",
    "workshop:delete", "workshop:join", "workshop:leave",

    // Enrollments
    "student:read_all", "student:read_own",
    "member:remove", // retirer un membre d'un pôle

    // Rapports
    "report:read_all",

    // Sessions
    "session:read", "session:read_own", "session:read_enrolled",
    "session:create", "session:create_own",
    "session:update", "session:update_own",
    "session:delete", "session:delete_own",

    // Attendance
    "attendance:read_all", "attendance:read_own",
    "attendance:manage", "attendance:manage_own",

    // Grades
    "grade:read_all", "grade:read_own",
    "grade:manage", "grade:manage_own",

    // Settings
    "settings:manage",

    // Admin
    "stats:read_all",

    // Programme (consultation seule, pas de publication)
    // (publish/reject réservés SG + secrétaire adjoint)

    // Transferts
    "transfer:force",
    "transfer:recalibrate",

    // Orientations
    "orientation:create", "orientation:read_own", "orientation:read_all", "orientation:cancel",
  ],

  [ROLES.VICE_PRESIDENT]: [
    // Identique au président
    "user:read_all", "user:read_one", "user:read_own",
    "user:deactivate", "user:restore", "user:hard_delete", "user:trash",
    "workshop:read_all", "workshop:read_own", "workshop:read_available",
    "workshop:create", "workshop:update_all", "workshop:update_own",
    "workshop:delete", "workshop:join", "workshop:leave",
    "student:read_all", "student:read_own",
    "member:remove",
    "report:read_all",
    "session:read", "session:read_own", "session:read_enrolled",
    "session:create", "session:create_own",
    "session:update", "session:update_own",
    "session:delete", "session:delete_own",
    "attendance:read_all", "attendance:read_own",
    "attendance:manage", "attendance:manage_own",
    "grade:read_all", "grade:read_own",
    "grade:manage", "grade:manage_own",
    "settings:manage",
    "stats:read_all",
    "transfer:force",
    "transfer:recalibrate",
    "orientation:create", "orientation:read_own", "orientation:read_all", "orientation:cancel",
  ],

  [ROLES.SECRETAIRE_GENERALE]: [
    "user:read_own",
    // Programme : contrôle total
    "schedule:read_all",
    "schedule:create",
    "schedule:update",
    "schedule:publish",
    "schedule:reject",
    "schedule:delete",
    // Consultations
    "workshop:read_all", "workshop:read_own",
    "report:read_all",
    "grade:read_all",
    "orientation:read_all",
    "member:read_all", // pour affichage
  ],

  [ROLES.SECRETAIRE_ADJOINT]: [
    "user:read_own",
    // Mêmes pouvoirs que SG sur le programme
    "schedule:read_all",
    "schedule:create",
    "schedule:update",
    "schedule:publish",
    "schedule:reject",
    "schedule:delete",
    "workshop:read_all", "workshop:read_own",
    "report:read_all",
    "grade:read_all",
    "orientation:read_all",
    "member:read_all",
  ],

  [ROLES.COORDINATEUR_GENERAL]: [
    "user:read_own",
    // Lecture seule sur les pôles
    "workshop:read_all", "workshop:read_own",
    // Peut retirer un membre de n'importe quel pôle
    "member:remove",
    // Lecture rapports + membres
    "report:read_all",
    "student:read_all",
    "member:read_all",
    "grade:read_all",
    // Reçoit les plaintes/propositions (consultation)
    "orientation:read_all",
    "transfer:recalibrate", // peut recaler (comme admin/president)
    "orientation:create", "orientation:read_own", "orientation:cancel",
  ],

  [ROLES.RESPONSABLE_COMMUNICATION]: [
    "user:read_own",
    // Lecture rapports uniquement
    "report:read_all",
    "orientation:create", "orientation:read_own", "orientation:cancel",
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
    // Programme
    "schedule:propose",
    "schedule:read_own",
    // Transferts
    "transfer:approve_source", "transfer:approve_destination",
    // Recalage vers ses propres pôles
    "transfer:recalibrate_own",
    "orientation:read_own",
    "orientation:create", "orientation:cancel",
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
    "schedule:propose",
    "schedule:read_own",
    "orientation:read_own",
    "orientation:create", "orientation:cancel",
  ],

  [ROLES.STUDENT]: [
    "user:read_own",
    "workshop:read_available", "workshop:read_own",
    "workshop:join", "workshop:leave",
    "session:read_enrolled",
    "attendance:read_own",
    "grade:read_own",
    "orientation:create", "orientation:read_own", "orientation:cancel",
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
  REJECTED: "rejected", // refusé par le chef (≠ dropped = parti volontairement)
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
};

const SCHEDULE_STATUS = {
  PROPOSED: "proposed",
  DRAFT: "draft",
  PUBLISHED: "published",
  REJECTED: "rejected",
};

const SEXE = {
  HOMME: "homme",
  FEMME: "femme",
};

const DEFAULT_MAX_WORKSHOPS_PER_USER = 3;

module.exports = {
  ROLES,
  ALL_ROLES,
  SUPERUSER_ROLES,
  SCHEDULE_MANAGER_ROLES,
  PERMISSIONS,
  hasPermission,
  WORKSHOP_STATUS,
  ATTENDANCE_STATUS,
  ENROLLMENT_STATUS,
  ASSESSMENT_TYPE,
  ORIENTATION_STATUS,
  SCHEDULE_STATUS,
  SEXE,
  DEFAULT_MAX_WORKSHOPS_PER_USER,
};