const router = require("express").Router();
const ctrl = require("../controllers/reportController");
const { protect } = require("../middlewares/authMiddleware");
const { scanLimiter } = require("../middlewares/rateLimit");

/* ─── Mes présences (self) ─── */
router.get("/me/attendance", protect, ctrl.myAttendances);

/* ─── Bulk sync offline ─── */
router.post("/bulk-sync", protect, ctrl.bulkSync);

/* ─── CRUD rapports ─── */
router.get("/", protect, ctrl.list);
router.post("/", protect, ctrl.create);
router.get("/:id", protect, ctrl.getOne);
router.patch("/:id", protect, ctrl.update);
router.delete("/:id", protect, ctrl.remove);

/* ─── Attendees (manuel) ─── */
router.patch("/:id/attendees", protect, ctrl.updateAttendees);

/* ─── Scan QR (chef/adjoint owner) ─── */
router.get("/:id/scan/lookup/:qrToken", protect, scanLimiter, ctrl.scanLookup);
router.post("/:id/scan", protect, scanLimiter, ctrl.scanMark);

module.exports = router;