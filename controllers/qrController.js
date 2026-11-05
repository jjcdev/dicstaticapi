const crypto = require("crypto");
const { User } = require("../models");
const { ROLES } = require("../utils/constants");

/**
 * GET /users/me/qr
 * Retourne le QR token du user. Le génère lazily au premier appel.
 */
exports.getMyQr = async (req, res, next) => {
  try {
    const user = req.user;

    let generated = false;

    // Génération lazy
    if (!user.qr_token) {
      user.qr_token = crypto.randomUUID();
      user.qr_generated_at = new Date();
      user.qr_reset_at = null;
      await user.save({ hooks: false });
      generated = true;
    }

    res.json({
      qr_token: user.qr_token,
      qr_payload: user.qr_token, // identique — le front génère l'image via `qrcode`
      qr_generated_at: user.qr_generated_at,
      qr_reset_at: user.qr_reset_at,
      qr_needs_refresh: false, // toujours false ici (on vient de le générer/lire)
      generated,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /users/me/qr/regenerate
 * Invalide l'ancien QR et en génère un nouveau.
 */
exports.regenerateMyQr = async (req, res, next) => {
  try {
    const user = req.user;

    user.qr_token = crypto.randomUUID();
    user.qr_generated_at = new Date();
    user.qr_reset_at = null;
    await user.save({ hooks: false });

    res.json({
      message: "QR regénéré. L'ancien QR ne fonctionne plus.",
      qr_token: user.qr_token,
      qr_payload: user.qr_token,
      qr_generated_at: user.qr_generated_at,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/qr/reset-all
 * Réinitialise TOUS les QR codes. Nécessite { confirm: true }.
 * Réservé à l'admin.
 */
exports.resetAllQr = async (req, res, next) => {
  try {
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({ message: "Réservé à l'administrateur." });
    }

    if (req.body?.confirm !== true) {
      return res.status(400).json({
        message: "confirm: true requis pour réinitialiser tous les QR codes.",
      });
    }

    const now = new Date();
    const [count] = await User.update(
      {
        qr_token: null,
        qr_reset_at: now,
        // qr_generated_at conservé pour traçabilité
      },
      {
        where: { is_active: true },
        hooks: false,
      }
    );

    res.json({
      message: `${count} QR code(s) réinitialisé(s).`,
      count,
    });
  } catch (err) {
    next(err);
  }
};