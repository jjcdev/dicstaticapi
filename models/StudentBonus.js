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
      workshop_id: { type: DataTypes.UUID, allowNull: false },
      student_id: { type: DataTypes.UUID, allowNull: false },
      stars: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        validate: {
          min: { args: [1], msg: "Minimum 1 étoile." },
          max: { args: [5], msg: "Maximum 5 étoiles." },
        },
        comment: "Visuel optionnel (1-5). Peut être null si le respo ne veut que des points.",
      },
      points: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
        validate: {
          min: { args: [0], msg: "Points : min 0." },
          max: { args: [20], msg: "Points : max 20." },
        },
        comment: "Points ajoutés à la moyenne. Le respo choisit librement.",
      },
      reason: { type: DataTypes.STRING(255), allowNull: true },
      awarded_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "student_bonuses",
      indexes: [{ fields: ["workshop_id", "student_id"] }],
    }
  );