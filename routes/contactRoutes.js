const router = require("express").Router();
const ctrl = require("../controllers/contactController");
const { protect } = require("../middlewares/authMiddleware");
const { contactLimiter } = require("../middlewares/rateLimit");

router.post("/", contactLimiter, ctrl.create);
router.get("/", protect, ctrl.list);
router.patch("/:id/read", protect, ctrl.markRead);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;