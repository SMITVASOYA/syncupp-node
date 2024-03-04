const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();
const Configuration = require("../models/configurationSchema");

exports.setupNightlyCronJob = async () => {
  const config = await Configuration.findOne({});
  cronSchedule = config?.cron_job.invoice_overdue;
  cron.schedule(cronSchedule, () => {
    console.log("Running the nightly cron job...");
    invoiceService.overdueCronJob();
  });
};
