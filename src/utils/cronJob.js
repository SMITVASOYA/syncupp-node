const cron = require("node-cron");
const InvoiceService = require("../services/invoiceService");
const invoiceService = new InvoiceService();
const ActivityService = require("../services/activityService");
const activityService = new ActivityService();
const Configuration = require("../models/configurationSchema");
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

  // Crone job for 15 minutes start

  cron.schedule("* * * * *", async () => {
    const currentDate = moment().startOf("day");
    const callMeeting = await Activity_Type_Master.findOne({
      name: "call_meeting",
    });
    const meetings = await Activity.find({
      activity_type: callMeeting._id,
      is_deleted: false,
      meeting_start_time: {
        $gte: currentDate.toDate(), // Meetings starting today
        $lte: moment().add(15, "minutes").toDate(), // Meetings starting within 15 minutes
      },
    }).lean();

    meetings.forEach((meeting) => {
      const meetingStartTime = moment.utc(meeting.meeting_start_time);
      const cronTime = moment(meetingStartTime)
        .subtract(15, "minutes")
        .toDate();
      const cronTimeString = moment(cronTime).format("m H D M *");

      cron.schedule(cronTimeString, () => {
        activityService.meetingAlertCronJob(meeting); // Pass meeting details to the cron job function
      });
    });
  });
};
