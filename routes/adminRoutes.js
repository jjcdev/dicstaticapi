const router = require("express").Router();
const { stats } = require("../controllers/adminController");
const qrCtrl = require("../controllers/qrController");
const { protectAdmin } = require("../middlewares/authMiddleware");

/* Stats plateforme */
router.get("/stats", protectAdmin, stats);

/* Reset global des QR codes (admin seul) */
router.post("/qr/reset-all", protectAdmin, qrCtrl.resetAllQr);

module.exports = router;