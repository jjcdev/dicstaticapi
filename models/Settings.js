const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Settings",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true,
      },
      value: {
        type: DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "settings",
    }
  );