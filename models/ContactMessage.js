module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "ContactMessage",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false },
      subject: { type: DataTypes.STRING(200), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "contact_messages" }
  );