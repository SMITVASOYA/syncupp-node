const notificationRoute = require("express").Router();
const validatorFunc = require("../utils/validatorFunction.helper");
const notificationController = require("../controllers/notificationController");
const { protect } = require("../middlewares/authMiddleware");
const { validateCreateInquiry } = require("../validators/inquiry.validator");

notificationRoute.post("/create", notificationController.addNotification);

notificationRoute.use(protect);
notificationRoute.get("/", notificationController.getNotification);
notificationRoute.post(
  "/read-notification",
  notificationController.readNotification
);

module.exports = notificationRoute;
