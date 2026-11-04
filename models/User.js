const { DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const { ROLES, SEXE } = require("../utils/constants");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Prénom requis." },
          len: { args: [2, 100], msg: "Prénom : 2 à 100 caractères." },
        },
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Nom requis." },
          len: { args: [2, 100], msg: "Nom : 2 à 100 caractères." },
        },
      },
      sexe: {
        type: DataTypes.ENUM(SEXE.HOMME, SEXE.FEMME),
        allowNull: true,
        comment: "nullable — utilisé pour le genrage des rôles côté frontend",
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
        validate: { isEmail: { msg: "Email invalide." } },
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM(...Object.values(ROLES)),
        allowNull: false,
        defaultValue: ROLES.STUDENT,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      profile_picture: { type: DataTypes.STRING(255), allowNull: true },
      bio: { type: DataTypes.TEXT, allowNull: true },
      department: { type: DataTypes.STRING(100), allowNull: true },
      level: { type: DataTypes.STRING(50), allowNull: true },
      reset_password_token: { type: DataTypes.STRING(255), allowNull: true },
      reset_password_expire: { type: DataTypes.DATE, allowNull: true },
      last_login: { type: DataTypes.DATE, allowNull: true },
      legacy_admin_id: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    },
    {
      tableName: "users",
      paranoid: true,
      scopes: {
        active: { where: { is_active: true } },
        inactive: { where: { is_active: false } },
        admins: { where: { role: ROLES.ADMIN } },
      },
      hooks: {
        beforeCreate: async (user) => {
          if (user.password) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
        beforeUpdate: async (user) => {
          if (user.changed("password")) {
            user.password = await bcrypt.hash(user.password, 10);
          }
        },
        beforeBulkCreate: async (users, options) => {
          if (options.individualHooks) return;
          for (const user of users) {
            if (user.password) {
              user.password = await bcrypt.hash(user.password, 10);
            }
          }
        },
      },
    }
  );

  User.prototype.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
  };

  User.prototype.toSafeJSON = function () {
    const data = this.toJSON();
    delete data.password;
    delete data.reset_password_token;
    delete data.reset_password_expire;
    delete data.deleted_at;
    delete data.legacy_admin_id;
    return data;
  };

  return User;
};