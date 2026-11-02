const router = require("express").Router();
const ctrl = require("../controllers/contactController");
const { protectAdmin } = require("../middlewares/authMiddleware");
const { contactLimiter } = require("../middlewares/rateLimit");

router.post("/", contactLimiter, ctrl.create);
router.get("/", protectAdmin, ctrl.list);
router.patch("/:id/read", protectAdmin, ctrl.markRead);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;