const { DataTypes } = require("sequelize");
const { ASSESSMENT_TYPE } = require("../utils/constants");

module.exports = (sequelize) =>
  sequelize.define(
    "Assessment",
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
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Nom requis." },
          len: { args: [2, 120], msg: "Nom : 2 à 120 caractères." },
        },
      },
      type: {
        type: DataTypes.ENUM(
          ASSESSMENT_TYPE.DEVOIR,
          ASSESSMENT_TYPE.EXAMEN,
          ASSESSMENT_TYPE.PROJECT,
          ASSESSMENT_TYPE.PARTICIPATION,
          ASSESSMENT_TYPE.BONUS
        ),
        allowNull: false,
        defaultValue: ASSESSMENT_TYPE.DEVOIR,
      },
      max_value: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 20,
        validate: { min: { args: [1], msg: "Note maximale : 1 minimum." } },
      },
      coefficient: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: { args: [0.1], msg: "Coefficient : 0.1 minimum." },
        },
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "assessments",
      indexes: [{ fields: ["workshop_id"] }],
    }
  );