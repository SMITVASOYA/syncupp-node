const router = require("express").Router();

const authRoute = require("./authRoute");
const adminRoute = require("./adminRoute");
const agencyRoute = require("./agencyRoute");
const clientRoute = require("./clientRoute");
const teamMemberRoute = require("./teamMemberRoute");
const invoiceRoute = require("./invoiceRoute");
const agreementRoute = require("./agreementRoute");
const activityRoute = require("./activityRoute");
const boardRoute = require("./boardRoute");
const paymentRoute = require("./paymentRoute");
const inquiryRoute = require("./inquiryRoute");
const affiliateRoute = require("./affiliateRoute");
const cmsRoute = require("./cmsRoute");
const referralRoute = require("./referralRoute");
const notificationRoute = require("./notificationRoute");
const dashboardRoute = require("./dashboardRoute");
const chatRoute = require("./chatRoute");
const eventRoute = require("./eventRoute");
const couponRoute = require("./couponRoute");
const ticketRoute = require("./ticketRoute");
const workspaceRoute = require("./workspaceRoute");
const sectionRoute = require("./sectionRoute");

router.use("/activity", activityRoute);
router.use("/board", boardRoute);
router.use("/auth", authRoute);
router.use("/admin", adminRoute);
router.use("/affiliate", affiliateRoute);
router.use("/agency", agencyRoute);
router.use("/invoice", invoiceRoute);
router.use("/team-member", teamMemberRoute);
router.use("/client", clientRoute);
router.use("/payment", paymentRoute);
router.use("/inquiry", inquiryRoute);
router.use("/agreement", agreementRoute);
router.use("/crm", cmsRoute);
router.use("/referral", referralRoute);
router.use("/notification", notificationRoute);
router.use("/dashboard", dashboardRoute);
router.use("/chat", chatRoute);
router.use("/event", eventRoute);
router.use("/coupon", couponRoute);
router.use("/ticket", ticketRoute);
router.use("/workspace", workspaceRoute);
router.use("/section", sectionRoute);

module.exports = router;
