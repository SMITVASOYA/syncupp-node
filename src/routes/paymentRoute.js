const paymentRoute = require("express").Router();
const paymentConrtoller = require("../controllers/paymentController");
const { protect } = require("../middlewares/authMiddleware");

paymentRoute.post("/plan-create", paymentConrtoller.createPlan);
paymentRoute.post("/webhook", paymentConrtoller.webHookHandler);
paymentRoute.post("/verify-signature", paymentConrtoller.verifySignature);

paymentRoute.use(protect);
paymentRoute.post("/order", paymentConrtoller.singleTimePayment);
paymentRoute.post("/history", paymentConrtoller.paymentHistory);
paymentRoute.post("/create-subscription", paymentConrtoller.createSubscription);
paymentRoute.post("/sheets", paymentConrtoller.sheetsListing);
paymentRoute.post("/remove-user", paymentConrtoller.removeUser);
paymentRoute.get("/cancel-subscription", paymentConrtoller.cancelSubscription);
paymentRoute.get("/get-subscription", paymentConrtoller.getSubscriptionDetail);
paymentRoute.get("/payment-scopes", paymentConrtoller.paymentScopes);
paymentRoute.post("/referral-payout", paymentConrtoller.referralPay);

module.exports = paymentRoute;
