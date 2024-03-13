const couponRoute = require("express").Router();
const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const couponController = require("../controllers/couponController");

couponRoute.use(protect);

couponRoute.get(
  "/coupon-list",
  authorizeRole("agency"),
  couponController.getAllCouponWithOutPagination
);
couponRoute.get("/list", authorizeRole("agency"), couponController.getmyCoupon);

module.exports = couponRoute;
