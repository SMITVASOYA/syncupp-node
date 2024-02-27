const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();

exports.setupNightlyCronJob = () => {
  // Schedule the cron job to run every night at 12 (0 hours)
  cron.schedule("0 0 * * *", () => {
    console.log("Running the nightly cron job...");
    invoiceService.overdueCronJob();
  });
};
