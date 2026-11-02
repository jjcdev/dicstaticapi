const router = require("express").Router();
const ctrl = require("../controllers/notificationController");
const { protect } = require("../middlewares/authMiddleware");

router.get("/", protect, ctrl.list);
router.post("/mark-read", protect, ctrl.markAllRead);

module.exports = router;