const { DataTypes } = require("sequelize");
const { ATTENDANCE_STATUS } = require("../utils/constants");

module.exports = (sequelize) =>
  sequelize.define(
    "Attendance",
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
      status: {
        type: DataTypes.ENUM(
          ATTENDANCE_STATUS.PRESENT,
          ATTENDANCE_STATUS.ABSENT,
          ATTENDANCE_STATUS.LATE,
          ATTENDANCE_STATUS.EXCUSED
        ),
        allowNull: false,
        defaultValue: ATTENDANCE_STATUS.ABSENT,
      },
      remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      marked_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "attendances",
      indexes: [{ unique: true, fields: ["session_id", "student_id"] }],
    }
  );