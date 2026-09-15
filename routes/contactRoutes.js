const router = require("express").Router();
const ctrl = require("../controllers/contactController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/", ctrl.create);
router.get("/", protect, ctrl.list);
router.patch("/:id/read", protect, ctrl.markRead);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;