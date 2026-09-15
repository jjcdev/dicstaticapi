const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Admin = require("./Admin")(sequelize, DataTypes);
const AcademicYear = require("./AcademicYear")(sequelize, DataTypes);
const Member = require("./Member")(sequelize, DataTypes);
const GalleryPost = require("./GalleryPost")(sequelize, DataTypes);
const Event = require("./Event")(sequelize, DataTypes);
const ContactMessage = require("./ContactMessage")(sequelize, DataTypes);

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

module.exports = {
  sequelize,
  Admin,
  AcademicYear,
  Member,
  GalleryPost,
  Event,
  ContactMessage,
};