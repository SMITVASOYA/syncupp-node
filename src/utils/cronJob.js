const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();
const ActivityService = require("../services/activityService");
const PaymentService = require("../services/paymentService");
const activityService = new ActivityService();
const Configuration = require("../models/configurationSchema");
const paymentService = new PaymentService();
const Activity_Type_Master = require("../models/masters/activityTypeMasterSchema");
const Activity = require("../models/activitySchema");
const moment = require("moment");

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
    // Crone job for 15 minutes start
  });

  // Crone job for 15 minutes start
  // const callMeetingCron = config?.cron_job.call_meeting_alert;
  // const call_meeting_alert_check_rate =
  //   config?.cron_job.call_meeting_alert_check_rate;
  // cron.schedule(call_meeting_alert_check_rate, async () => {
  //   const currentUtcDate = moment().utc(); // Get current UTC time
  //   const callMeeting = await Activity_Type_Master.findOne({
  //     name: "call_meeting",
  //   });
  //   const meetings = await Activity.find({
  //     activity_type: callMeeting._id,
  //     is_deleted: false,
  //     meeting_start_time: {
  //       $gte: currentUtcDate.toDate(), // Meetings starting today
  //       $lte: moment(currentUtcDate).add(callMeetingCron, "minutes").toDate(),
  //     },
  //   }).lean();
  //   meetings.forEach((meeting) => {
  //     activityService.meetingAlertCronJob(meeting); // Pass meeting details to the cron job function
  //   });
  // });
};
