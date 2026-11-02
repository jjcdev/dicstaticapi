const router = require("express").Router();
const ctrl = require("../controllers/reportController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/", protect, ctrl.create);
router.post("/bulk-sync", protect, ctrl.bulkSync);
router.get("/", protect, ctrl.list);
router.get("/me/attendance", protect, ctrl.myAttendances);
router.get("/:id", protect, ctrl.getOne);
router.patch("/:id", protect, ctrl.update);
router.patch("/:id/attendees", protect, ctrl.updateAttendees);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;