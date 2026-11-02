const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Grade",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      assessment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      value: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: "NULL = non noté",
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      graded_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "grades",
      indexes: [{ unique: true, fields: ["assessment_id", "student_id"] }],
    }
  );