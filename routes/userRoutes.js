const router = require("express").Router();
const ctrl = require("../controllers/userController");
const qrCtrl = require("../controllers/qrController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/rbac");

/* ─── Self (profil + QR) ─── */
router.patch("/me", protect, ctrl.updateSelf);
router.get("/me/qr", protect, qrCtrl.getMyQr);
router.post("/me/qr/regenerate", protect, qrCtrl.regenerateMyQr);

/* ─── Lecture (admin + president + VP) ─── */
router.get("/", protect, authorize("user:read_all"), ctrl.getAll);
router.get("/:id", protect, ctrl.getOne);

/* ─── Gestion rôle (ADMIN SEUL) ─── */
router.patch("/:id/role", protect, ctrl.updateRole);

/* ─── Activation / désactivation ─── */
router.patch("/:id/activate", protect, authorize("user:restore"), ctrl.reactivate);
router.delete("/:id", protect, authorize("user:deactivate"), ctrl.deactivate);

module.exports = router;