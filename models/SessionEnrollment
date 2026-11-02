const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "SessionEnrollment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      enrolled_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Snapshot : date à laquelle l'étudiant avait rejoint l'atelier",
      },
    },
    {
      tableName: "session_enrollments",
      indexes: [{ unique: true, fields: ["session_id", "student_id"] }],
    }
  );