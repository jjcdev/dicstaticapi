const router = require("express").Router();
const ctrl = require("../controllers/applicationController");
const { protect } = require("../middlewares/authMiddleware");
const { applicationIpLimiter } = require("../middlewares/rateLimit");

// Public (avec throttling)
router.post("/", applicationIpLimiter, ctrl.create);

// Admin
router.get("/", protect, ctrl.list);
router.get("/:id", protect, ctrl.getOne);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;