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

router.use("/activity", activityRoute);
router.use("/auth", authRoute);
router.use("/admin", adminRoute);
router.use("/agency", agencyRoute);
// router.use("/agency/team-member", teamMemberRoute);
// router.use("", invoiceRoute);
// router.use("/client/team-member", teamMemberRoute);
router.use("/team-member", teamMemberRoute);
// router.use("/agency/invoice", invoiceRoute);
router.use("/client", clientRoute);
router.use("/payment", paymentRoute);
// router.use("", agreementRoute);

module.exports = router;
