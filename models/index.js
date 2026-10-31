const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Admin = require("./Admin")(sequelize, DataTypes);
const AcademicYear = require("./AcademicYear")(sequelize, DataTypes);
const Member = require("./Member")(sequelize, DataTypes);
const GalleryPost = require("./GalleryPost")(sequelize, DataTypes);
const Event = require("./Event")(sequelize, DataTypes);
const ContactMessage = require("./ContactMessage")(sequelize, DataTypes);
const Application = require("./Application")(sequelize, DataTypes);
const RuleSection = require("./RuleSection")(sequelize, DataTypes);
const ProgramItem = require("./ProgramItem")(sequelize, DataTypes);

AcademicYear.hasMany(Member, {
  foreignKey: "academic_year_id",
  as: "members",
  onDelete: "CASCADE",
});
Member.belongsTo(AcademicYear, {
  foreignKey: "academic_year_id",
  as: "academic_year",
});

AcademicYear.hasMany(GalleryPost, {
  foreignKey: "academic_year_id",
  as: "gallery_posts",
  onDelete: "SET NULL",
});
GalleryPost.belongsTo(AcademicYear, {
  foreignKey: "academic_year_id",
  as: "academic_year",
});

AcademicYear.hasMany(Event, {
  foreignKey: "academic_year_id",
  as: "events",
  onDelete: "SET NULL",
});
Event.belongsTo(AcademicYear, {
  foreignKey: "academic_year_id",
  as: "academic_year",
});

// ─── Programme annuel ───
AcademicYear.hasMany(ProgramItem, {
  foreignKey: "academic_year_id",
  as: "program_items",
  onDelete: "SET NULL",
});
ProgramItem.belongsTo(AcademicYear, {
  foreignKey: "academic_year_id",
  as: "academic_year",
});

// Sanity check dev : détecte les associations manquantes au boot
if (process.env.NODE_ENV !== "production") {
  const checks = [
    [Member, "academic_year"],
    [GalleryPost, "academic_year"],
    [Event, "academic_year"],
    [ProgramItem, "academic_year"],
  ];
  for (const [model, alias] of checks) {
    if (!model.associations?.[alias]) {
      console.warn(
        `[models] ⚠️  association manquante : ${model.name}.${alias}`
      );
    }
  }
}

module.exports = {
  sequelize,
  Admin,
  AcademicYear,
  Member,
  GalleryPost,
  Event,
  ContactMessage,
  Application,
  RuleSection,
  ProgramItem,
};