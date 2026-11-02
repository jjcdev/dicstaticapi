const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "StudentBonus",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      workshop_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      stars: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: { args: [1], msg: "Minimum 1 étoile." },
          max: { args: [5], msg: "Maximum 5 étoiles." },
        },
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      awarded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "student_bonuses",
      indexes: [{ fields: ["workshop_id", "student_id"] }],
    }
  );