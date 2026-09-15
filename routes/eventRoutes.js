const router = require("express").Router();
const ctrl = require("../controllers/eventController");
const { protect } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");

router.get("/", ctrl.list);
router.get("/:id", ctrl.getOne);
router.post("/", protect, upload.single("cover_image"), ctrl.create);
router.put("/:id", protect, upload.single("cover_image"), ctrl.update);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;