const router = require("express").Router();
const ctrl = require("../controllers/galleryController");
const { protect } = require("../middlewares/authMiddleware");
const { multerUpload } = require("../middlewares/upload");

router.get("/", ctrl.list);
router.post("/", protect, multerUpload.single("image"), ctrl.create);
router.put("/:id", protect, multerUpload.single("image"), ctrl.update);
router.delete("/:id", protect, ctrl.remove);

module.exports = router;