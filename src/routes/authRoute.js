const authRoute = require("express").Router();
const authController = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { upload, checkProfileSize } = require("../helpers/multer");

authRoute.post("/signup", authController.agencySignUp);

authRoute.post("/google-signup", authController.agencyGoogleSignUp);
authRoute.post("/facebook-signup", authController.agencyFacebookSignUp);

// this will work for all type of the memebers
authRoute.post("/login", authController.login);
authRoute.post("/forgot-password", authController.forgotPassword);
authRoute.post("/reset-password", authController.resetPassword);
authRoute.post("/countries", authController.countriesList);
authRoute.post("/states/:countryId", authController.statesList);
authRoute.post("/cities/:stateId", authController.citiesList);
authRoute.post("/set-password", authController.passwordSetRequired);

authRoute.use(protect);
authRoute.post("/change-password", authController.changePassword);
authRoute.get("/profile", authController.getProfile);
authRoute.patch(
  "/update-profile",
  checkProfileSize,
  upload.single("profile_image"),
  authController.updateProfile
);
authRoute.post("/send-referral", authController.refferalEmail);
authRoute.get("/subscription-halt", authController.checkSubscriptionHalt);
module.exports = authRoute;
