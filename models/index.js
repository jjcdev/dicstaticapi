const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Admin = require("./Admin")(sequelize, DataTypes);
const User = require("./User")(sequelize);
const AcademicYear = require("./AcademicYear")(sequelize, DataTypes);
const Member = require("./Member")(sequelize, DataTypes);
const GalleryPost = require("./GalleryPost")(sequelize, DataTypes);
const Event = require("./Event")(sequelize, DataTypes);
const ContactMessage = require("./ContactMessage")(sequelize, DataTypes);
const Application = require("./Application")(sequelize, DataTypes);
const RuleSection = require("./RuleSection")(sequelize, DataTypes);
const ProgramItem = require("./ProgramItem")(sequelize, DataTypes);

// Club management
const Workshop = require("./Workshop")(sequelize);
const WorkshopStudent = require("./WorkshopStudent")(sequelize);
const Assessment = require("./Assessment")(sequelize);
const Grade = require("./Grade")(sequelize);
const StudentBonus = require("./StudentBonus")(sequelize);
const WorkshopSettings = require("./WorkshopSettings")(sequelize);
const Settings = require("./Settings")(sequelize);

// Orientation / Programme
const OrientationPreference = require("./OrientationPreference")(sequelize);
const WorkshopTransferRequest = require("./WorkshopTransferRequest")(sequelize);
const WeeklySchedule = require("./WeeklySchedule")(sequelize);
const WeeklyScheduleSlot = require("./WeeklyScheduleSlot")(sequelize);

// Rapports de séance
const SessionReport = require("./SessionReport")(sequelize);
const SessionReportAttendee = require("./SessionReportAttendee")(sequelize);

/* ═══════════ Site vitrine ═══════════ */

AcademicYear.hasMany(Member, { foreignKey: "academic_year_id", as: "members", onDelete: "CASCADE" });
Member.belongsTo(AcademicYear, { foreignKey: "academic_year_id", as: "academic_year" });

AcademicYear.hasMany(GalleryPost, { foreignKey: "academic_year_id", as: "gallery_posts", onDelete: "SET NULL" });
GalleryPost.belongsTo(AcademicYear, { foreignKey: "academic_year_id", as: "academic_year" });

AcademicYear.hasMany(Event, { foreignKey: "academic_year_id", as: "events", onDelete: "SET NULL" });
Event.belongsTo(AcademicYear, { foreignKey: "academic_year_id", as: "academic_year" });

AcademicYear.hasMany(ProgramItem, { foreignKey: "academic_year_id", as: "program_items", onDelete: "SET NULL" });
ProgramItem.belongsTo(AcademicYear, { foreignKey: "academic_year_id", as: "academic_year" });

Member.belongsTo(User, { foreignKey: "user_id", as: "user", onDelete: "SET NULL" });
User.hasMany(Member, { foreignKey: "user_id", as: "member_profiles" });

/* ═══════════ Workshop ═══════════ */

User.hasMany(Workshop, { foreignKey: "instructor_id", as: "instructed_workshops" });
Workshop.belongsTo(User, { foreignKey: "instructor_id", as: "instructor" });

User.hasMany(Workshop, { foreignKey: "co_instructor_id", as: "co_instructed_workshops" });
Workshop.belongsTo(User, { foreignKey: "co_instructor_id", as: "co_instructor" });

Workshop.hasMany(WorkshopStudent, { foreignKey: "workshop_id", as: "enrollments", onDelete: "CASCADE" });
WorkshopStudent.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });

User.hasMany(WorkshopStudent, { foreignKey: "student_id", as: "enrollments" });
WorkshopStudent.belongsTo(User, { foreignKey: "student_id", as: "student" });

Workshop.belongsToMany(User, { through: WorkshopStudent, foreignKey: "workshop_id", otherKey: "student_id", as: "students" });
User.belongsToMany(Workshop, { through: WorkshopStudent, foreignKey: "student_id", otherKey: "workshop_id", as: "enrolled_workshops" });

WorkshopStudent.belongsTo(AcademicYear, { foreignKey: "academic_year_id", as: "academic_year", onDelete: "SET NULL" });

/* ═══════════ Assessment / Grade / Bonus / Settings ═══════════ */

Workshop.hasMany(Assessment, { foreignKey: "workshop_id", as: "assessments", onDelete: "CASCADE" });
Assessment.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });
User.hasMany(Assessment, { foreignKey: "created_by", as: "created_assessments" });
Assessment.belongsTo(User, { foreignKey: "created_by", as: "creator" });

Assessment.hasMany(Grade, { foreignKey: "assessment_id", as: "grades", onDelete: "CASCADE" });
Grade.belongsTo(Assessment, { foreignKey: "assessment_id", as: "assessment" });
User.hasMany(Grade, { foreignKey: "student_id", as: "grades_received" });
Grade.belongsTo(User, { foreignKey: "student_id", as: "student" });
User.hasMany(Grade, { foreignKey: "graded_by_id", as: "grades_given" });
Grade.belongsTo(User, { foreignKey: "graded_by_id", as: "graded_by" });

Workshop.hasMany(StudentBonus, { foreignKey: "workshop_id", as: "bonuses", onDelete: "CASCADE" });
StudentBonus.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });
User.hasMany(StudentBonus, { foreignKey: "student_id", as: "bonuses_received" });
StudentBonus.belongsTo(User, { foreignKey: "student_id", as: "student" });
User.hasMany(StudentBonus, { foreignKey: "awarded_by", as: "bonuses_awarded" });
StudentBonus.belongsTo(User, { foreignKey: "awarded_by", as: "awarder" });

Workshop.hasOne(WorkshopSettings, { foreignKey: "workshop_id", as: "settings", onDelete: "CASCADE" });
WorkshopSettings.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });
User.hasMany(WorkshopSettings, { foreignKey: "updated_by", as: "updated_workshop_settings" });
WorkshopSettings.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

User.hasMany(Settings, { foreignKey: "updated_by", as: "updated_settings" });
Settings.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

/* ═══════════ Orientation ═══════════ */

User.hasMany(OrientationPreference, { foreignKey: "student_id", as: "orientation_preferences" });
OrientationPreference.belongsTo(User, { foreignKey: "student_id", as: "student" });
Workshop.hasMany(OrientationPreference, { foreignKey: "target_workshop_id", as: "incoming_orientations", onDelete: "CASCADE" });
OrientationPreference.belongsTo(Workshop, { foreignKey: "target_workshop_id", as: "target_workshop" });
User.hasMany(OrientationPreference, { foreignKey: "decided_by", as: "orientation_decisions" });
OrientationPreference.belongsTo(User, { foreignKey: "decided_by", as: "decider" });

/* ═══════════ Transferts ═══════════ */

User.hasMany(WorkshopTransferRequest, { foreignKey: "student_id", as: "transfer_requests" });
WorkshopTransferRequest.belongsTo(User, { foreignKey: "student_id", as: "student" });
Workshop.hasMany(WorkshopTransferRequest, { foreignKey: "from_workshop_id", as: "transfers_out", onDelete: "CASCADE" });
WorkshopTransferRequest.belongsTo(Workshop, { foreignKey: "from_workshop_id", as: "from_workshop" });
Workshop.hasMany(WorkshopTransferRequest, { foreignKey: "to_workshop_id", as: "transfers_in", onDelete: "CASCADE" });
WorkshopTransferRequest.belongsTo(Workshop, { foreignKey: "to_workshop_id", as: "to_workshop" });

/* ═══════════ Planning hebdo ═══════════ */

Workshop.hasMany(WeeklySchedule, { foreignKey: "workshop_id", as: "weekly_schedules", onDelete: "CASCADE" });
WeeklySchedule.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });
User.hasMany(WeeklySchedule, { foreignKey: "created_by", as: "created_schedules" });
WeeklySchedule.belongsTo(User, { foreignKey: "created_by", as: "creator" });
User.hasMany(WeeklySchedule, { foreignKey: "published_by", as: "published_schedules" });
WeeklySchedule.belongsTo(User, { foreignKey: "published_by", as: "publisher" });
WeeklySchedule.hasMany(WeeklyScheduleSlot, { foreignKey: "schedule_id", as: "slots", onDelete: "CASCADE" });
WeeklyScheduleSlot.belongsTo(WeeklySchedule, { foreignKey: "schedule_id", as: "schedule" });

/* ═══════════ Rapports ═══════════ */

Workshop.hasMany(SessionReport, { foreignKey: "workshop_id", as: "reports", onDelete: "CASCADE" });
SessionReport.belongsTo(Workshop, { foreignKey: "workshop_id", as: "workshop" });
User.hasMany(SessionReport, { foreignKey: "author_id", as: "authored_reports" });
SessionReport.belongsTo(User, { foreignKey: "author_id", as: "author" });

SessionReport.hasMany(SessionReportAttendee, { foreignKey: "report_id", as: "attendees", onDelete: "CASCADE" });
SessionReportAttendee.belongsTo(SessionReport, { foreignKey: "report_id", as: "report" });
User.hasMany(SessionReportAttendee, { foreignKey: "student_id", as: "report_attendances" });
SessionReportAttendee.belongsTo(User, { foreignKey: "student_id", as: "student" });

/* ═══════════ Sanity check ═══════════ */

if (process.env.NODE_ENV !== "production") {
  const checks = [
    [Member, "academic_year"], [Member, "user"],
    [Workshop, "instructor"], [Workshop, "co_instructor"],
    [Workshop, "enrollments"], [Workshop, "reports"],
    [WorkshopStudent, "workshop"], [WorkshopStudent, "student"],
    [Assessment, "grades"], [Grade, "student"], [Grade, "assessment"],
    [OrientationPreference, "student"], [OrientationPreference, "target_workshop"],
    [WorkshopTransferRequest, "student"],
    [WorkshopTransferRequest, "from_workshop"],
    [WorkshopTransferRequest, "to_workshop"],
    [WeeklySchedule, "slots"], [WeeklySchedule, "workshop"],
    [WeeklyScheduleSlot, "schedule"],
    [SessionReport, "workshop"], [SessionReport, "author"], [SessionReport, "attendees"],
    [SessionReportAttendee, "student"], [SessionReportAttendee, "report"],
  ];
  for (const [model, alias] of checks) {
    if (!model.associations?.[alias]) {
      console.warn(`[models] ⚠️  association manquante : ${model.name}.${alias}`);
    }
  }
}

module.exports = {
  sequelize,
  Admin, User, AcademicYear, Member, GalleryPost, Event, ContactMessage,
  Application, RuleSection, ProgramItem,
  Workshop, WorkshopStudent,
  Assessment, Grade, StudentBonus, WorkshopSettings, Settings,
  OrientationPreference, WorkshopTransferRequest,
  WeeklySchedule, WeeklyScheduleSlot,
  SessionReport, SessionReportAttendee,
};