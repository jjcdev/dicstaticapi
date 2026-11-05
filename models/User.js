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
      phone: { type: DataTypes.STRING(20), allowNull: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
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

      // ─── QR code (généré lazy au premier GET /users/me/qr) ───
      qr_token: {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
        comment: "Token QR (UUID) — généré lazily, remplacé à chaque régénération",
      },
      qr_generated_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date de la dernière génération — conservée après reset admin",
      },
      qr_reset_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Date du dernier reset admin (null si jamais reset)",
      },
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

  /**
   * JSON "public" — pour les réponses qui exposent d'autres users
   * (listes admin, getOne d'un tiers, etc.).
   * AUCUN champ QR n'est exposé ici (le token QR est un secret personnel).
   */
  User.prototype.toSafeJSON = function () {
    const data = this.toJSON();
    delete data.password;
    delete data.reset_password_token;
    delete data.reset_password_expire;
    delete data.deleted_at;
    delete data.legacy_admin_id;
    delete data.qr_token;
    delete data.qr_generated_at;
    delete data.qr_reset_at;
    return data;
  };

  /**
   * JSON "self" — pour les réponses où le user se voit lui-même
   * (login, /auth/me, /users/me/qr, updateSelf).
   * Inclut les champs QR + un booléen calculé `qr_needs_refresh`.
   */
  User.prototype.toSelfJSON = function () {
    const data = this.toSafeJSON();
    data.qr_token = this.qr_token;
    data.qr_generated_at = this.qr_generated_at;
    data.qr_reset_at = this.qr_reset_at;
    // Vrai si l'utilisateur AVAIT un QR mais qu'il a été réinitialisé
    data.qr_needs_refresh = !this.qr_token && !!this.qr_generated_at;
    return data;
  };

  return User;
};