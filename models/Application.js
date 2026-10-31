module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "Application",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      first_name: { type: DataTypes.STRING(100), allowNull: false },
      last_name: { type: DataTypes.STRING(100), allowNull: false },
      school: { type: DataTypes.STRING(160), allowNull: false },
      field_of_study: { type: DataTypes.STRING(160), allowNull: false },
      pole: {
        type: DataTypes.ENUM("ia", "cybersecurity", "robotics"),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
      },
      phone_prefix: { type: DataTypes.STRING(8), allowNull: false },
      phone_number: { type: DataTypes.STRING(20), allowNull: false },
      motivations: { type: DataTypes.TEXT, allowNull: false },
      source: { type: DataTypes.STRING(160), allowNull: true },
    },
    { tableName: "applications" }
  );