const affiliateRoute = require("express").Router();
const validatorFunc = require("../utils/validatorFunction.helper");
const affiliateController = require("../controllers/affiliateController");
const { protect } = require("../middlewares/affiliateAdminMiddleware");
const {
  validateAffiliateRegistration,
  validateAffiliateLogin,
  validateAffiliateResetPassword,
} = require("../validators/affiliate.validator");

affiliateRoute.post(
  "/login",
  validateAffiliateLogin,
  validatorFunc,
  affiliateController.login
);

affiliateRoute.post(
  "/signup",
  validateAffiliateRegistration,
  validatorFunc,
  affiliateController.signUp
);

affiliateRoute.post("/forgot-password", affiliateController.forgotPassword);
affiliateRoute.post(
  "/reset-password",
  validateAffiliateResetPassword,
  validatorFunc,
  affiliateController.resetPassword
);

affiliateRoute.use(protect);
affiliateRoute.post("/change-password", affiliateController.changePassword);

module.exports = affiliateRoute;
