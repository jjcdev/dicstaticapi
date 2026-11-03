const router = require("express").Router();
const ctrl = require("../controllers/recalibrateController");
const { protect } = require("../middlewares/authMiddleware");

router.post("/bulk", protect, ctrl.bulkRecalibrate);

router.post("/targeted/preview", protect, ctrl.targetedRecalibratePreview);
router.post("/targeted", protect, ctrl.targetedRecalibrate);

module.exports = router;