module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "Admin",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(60), allowNull: false },
      email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      role: { type: DataTypes.STRING(30), defaultValue: "admin" },
    },
    { tableName: "admins" }
  );