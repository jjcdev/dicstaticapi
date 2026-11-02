const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "SessionReportAttendee",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      report_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("present", "absent"),
        allowNull: false,
        defaultValue: "absent",
        comment: "Défaut absent ; le chef clique sur les présents",
      },
      absence_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      marked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "session_report_attendees",
      indexes: [
        { unique: true, fields: ["report_id", "student_id"] },
        { fields: ["student_id"] },
      ],
    }
  );