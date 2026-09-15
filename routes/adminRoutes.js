const router = require("express").Router();
const { stats } = require("../controllers/adminController");
const { protect } = require("../middlewares/authMiddleware");

router.get("/stats", protect, stats);

module.exports = router;