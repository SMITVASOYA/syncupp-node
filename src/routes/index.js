const router = require("express").Router();

const authRoute = require("./authRoute");
const adminRoute = require("./adminRoute");
const agencyRoute = require("./agencyRoute");
const clientRoute = require("./clientRoute");
const teamMemberRoute = require("./teamMemberRoute");
const invoiceRoute = require("./invoiceRoute");
const agreementRoute = require("./agreementRoute");
const activityRoute = require("./activityRoute");
const paymentRoute = require("./paymentRoute");
const inquiryRoute = require("./inquiryRoute");
const affiliateRoute = require("./affiliateRoute");
const cmsRoute = require("./cmsRoute");

router.use("/activity", activityRoute);
router.use("/auth", authRoute);
router.use("/admin", adminRoute);
router.use("/affiliate", affiliateRoute);
router.use("/agency", agencyRoute);
// router.use("/api/v1/agency/team-member", teamMemberRoute);
router.use("/invoice", invoiceRoute);
// router.use("/api/v1/client/team-member", teamMemberRoute);
router.use("/team-member", teamMemberRoute);
router.use("/client", clientRoute);
// router.use("/agency/team-member", teamMemberRoute);
// router.use("", invoiceRoute);
// router.use("/client/team-member", teamMemberRoute);
// router.use("/agency/invoice", invoiceRoute);
router.use("/payment", paymentRoute);
router.use("/inquiry", inquiryRoute);
router.use("/agreement", agreementRoute);
router.use("/crm", cmsRoute);

module.exports = router;
