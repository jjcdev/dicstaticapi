const router = require("express").Router();
const ctrl = require("../controllers/settingsController");
const { protect, protectAdmin } = require("../middlewares/authMiddleware");

router.get("/max-workshops", protect, ctrl.getMaxWorkshops);
router.get("/", protectAdmin, ctrl.getAll);
router.patch("/", protectAdmin, ctrl.update);

module.exports = router;