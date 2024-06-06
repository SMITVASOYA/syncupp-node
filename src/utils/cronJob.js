const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();
const TaskService = require("../services/taskService");
const PaymentService = require("../services/paymentService");
const taskService = new TaskService();
const ActivityService = require("../services/activityService");
const activityService = new ActivityService();
const Configuration = require("../models/configurationSchema");
const paymentService = new PaymentService();
const Activity_Type_Master = require("../models/masters/activityTypeMasterSchema");
const Activity = require("../models/activitySchema");
const moment = require("moment");
const PaymentHistory = require("../models/paymentHistorySchema");
const Authentication = require("../models/authenticationSchema");
const NotificationService = require("../services/notificationService");
const { paymentExpireAlert, returnMessage } = require("./utils");
const sendEmail = require("../helpers/sendEmail");
const notificationService = new NotificationService();

exports.setupNightlyCronJob = async () => {
  const config = await Configuration.findOne({});

  let privacy_policy = config?.urls?.privacy_policy;
  let facebook = config?.urls?.facebook;
  let instagram = config?.urls?.instagram;

  // For invoice overdue
  const invoiceCronSchedule = config?.cron_job.invoice_overdue;
  cron.schedule(invoiceCronSchedule, () => {
    console.log("Running the nightly cron job for invoice...");
    invoiceService.overdueCronJob();
  });

  // For task overdue
  const taskOverdueCronSchedule = config?.cron_job.task_overdue;
  cron.schedule(taskOverdueCronSchedule, () => {
    console.log("Running the nightly cron job activity...");
    taskService.overdueCronJob();
  });
  const taskDueDateCronSchedule = config?.cron_job.task_dueDate;
  cron.schedule(taskDueDateCronSchedule, () => {
    console.log("Running the nightly cron job activity for due date...");
    taskService.dueDateCronJob();
  });

  const payment_cron_schedule = config?.cron_job?.payment;
  cron.schedule(payment_cron_schedule, () => {
    console.log(
      "Running the nightly cron job to expire the subscription and ..."
    );
    // paymentService.cronForSubscription();
    paymentService.cronForFreeTrialEnd();
  });

  // // Crone job for 15 minutes start
  // const call_meeting_alert_check_rate =
  //   config?.cron_job.call_meeting_alert_check_rate;
  // cron.schedule(call_meeting_alert_check_rate, async () => {
  //   const currentUtcDate = moment().utc();

  //   // Find all activities that are not deleted and are recurring
  //   const meetings = await Activity.find({
  //     is_deleted: false,
  //     recurring: true,
  //   }).lean();
  //   activityService.meetingAlertCronJob(meetings);
  // });

  // After Expire alert
  const afterExpireAlert = config?.cron_job.after_expire_alert_time;
  // cron.schedule(afterExpireAlert, async () => {
  //   const twentyFourHoursAgo = moment().subtract(24, "hours").toDate();
  //   const fortyEightHoursAgo = moment().subtract(48, "hours").toDate();

  //   const expiredAccounts = await Authentication.find({
  //     subscription_halted: {
  //       $gt: fortyEightHoursAgo,
  //       $lte: twentyFourHoursAgo,
  //     },
  //   })
  //     .populate("role")
  //     .lean();
  //   expiredAccounts.forEach(async (item) => {
  //     await notificationService.addNotification({
  //       module_name: "payment",
  //       action_name: "packageExpiredAlert",
  //       receiver_id: item.reference_id,
  //       user_name: item.first_name + " " + item.last_name,
  //       role_name: item?.role?.name,
  //     });

  //     const paymentAlertTemplate = paymentExpireAlert(
  //       item?.first_name + " " + item?.last_name,
  //       privacy_policy,
  //       instagram,
  //       facebook
  //     );

  //     sendEmail({
  //       email: item?.email,
  //       subject: returnMessage("emailTemplate", "planExpired"),
  //       message: paymentAlertTemplate,
  //     });
  //   });
  // });
};
