module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "Member",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      first_name: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      last_name: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      photo_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      linkedin: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      github: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      display_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      academic_year_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: "members",
    }
  );