const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();
const ActivityService = require("../services/activityService");
const PaymentService = require("../services/paymentService");
const activityService = new ActivityService();
const Configuration = require("../models/configurationSchema");
const paymentService = new PaymentService();
exports.setupNightlyCronJob = async () => {
  const config = await Configuration.findOne({});
  const invoiceCronSchedule = config?.cron_job.invoice_overdue;
  cron.schedule(invoiceCronSchedule, () => {
    console.log("Running the nightly cron job for invoice...");
    invoiceService.overdueCronJob();
  });

  const activityOverdueCronSchedule = config?.cron_job.activity_overdue;
  cron.schedule(activityOverdueCronSchedule, () => {
    console.log("Running the nightly cron job activity...");
    activityService.overdueCronJob();
  });

  const activityDueDateCronSchedule = config?.cron_job.activity_dueDate;
  cron.schedule(activityDueDateCronSchedule, () => {
    console.log("Running the nightly cron job activity for due date...");
    activityService.dueDateCronJob();
  });

  const payment_cron_schedule = config?.cron_job?.payment;
  cron.schedule(payment_cron_schedule, () => {
    console.log("Running the nightly cron job to expire the subscription...");
    paymentService.cronForSubscription();
  });
};
