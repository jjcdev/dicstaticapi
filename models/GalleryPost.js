module.exports = (sequelize, DataTypes) =>
  sequelize.define(
    "GalleryPost",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(160), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      category: {
        type: DataTypes.ENUM("workshop", "event", "project", "other"),
        defaultValue: "other",
      },
      event_date: { type: DataTypes.DATEONLY, allowNull: true },
      image_url: { type: DataTypes.STRING(255), allowNull: true },
      academic_year_id: { type: DataTypes.INTEGER, allowNull: true },
    },
    { tableName: "gallery_posts" }
  );