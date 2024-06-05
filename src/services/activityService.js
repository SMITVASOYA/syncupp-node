const Activity = require("../models/activitySchema");
const ActivityStatus = require("../models/masters/activityStatusMasterSchema");
const ActivityType = require("../models/masters/activityTypeMasterSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  paginationObject,
  getKeywordType,
  validateRequestFields,
  taskTemplate,
  activityTemplate,
  capitalizeFirstLetter,
} = require("../utils/utils");
const moment = require("moment");
const { default: mongoose } = require("mongoose");
const Team_Agency = require("../models/teamAgencySchema");
const statusCode = require("../messages/statusCodes.json");
const sendEmail = require("../helpers/sendEmail");
const Authentication = require("../models/authenticationSchema");
const Configuration = require("../models/configurationSchema");
const Competition_Point = require("../models/competitionPointSchema");
const NotificationService = require("./notificationService");
const Agency = require("../models/agencySchema");
const Activity_Status_Master = require("../models/masters/activityStatusMasterSchema");
const notificationService = new NotificationService();
const EventService = require("../services/eventService");
const eventService = new EventService();
const ics = require("ics");
const fs = require("fs");
const Activity_Type_Master = require("../models/masters/activityTypeMasterSchema");
const momentTimezone = require("moment-timezone");
const Team_Client = require("../models/teamClientSchema");
const Board = require("../models/boardSchema");
const { ObjectId } = require("mongoose");
const Section = require("../models/sectionSchema");
const Workspace = require("../models/workspaceSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const AuthService = require("../services/authService");
const Gamification = require("../models/gamificationSchema");
const authService = new AuthService();
const Meeting = require("google-meet-api").meet;
require("dotenv").config();
const { google } = require("googleapis");
const axios = require("axios");

class ActivityService {
  // this function is used to create the call meeting and other call details
  createCallMeeting = async (payload, user) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;

      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      validateRequestFields(payload, [
        "title",
        "meeting_date",
        "meeting_start_time",
        "meeting_end_time",
      ]);

      const {
        title,
        agenda,
        meeting_date,
        meeting_start_time,
        meeting_end_time,
        internal_info,
        attendees,
        all_day,
        alert_time,
        alert_time_unit,
        recurrence_pattern,
        recurrence_interval,
        weekly_recurrence_days,
        monthly_recurrence_day_of_month,
      } = payload;

      let google_meet_link;

      if (payload?.google_meeting) {
        google_meet_link = await this.createCallGoogleMeeting(payload);
      }

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(meeting_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${meeting_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${meeting_date}-${meeting_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("activity", "dateinvalid"));
      if (!end_time.isAfter(start_time))
        return throwError(returnMessage("activity", "invalidTime"));

      if (payload?.recurrence_end_date) {
        recurring_date = moment
          .utc(payload?.recurrence_end_date, "DD-MM-YYYY")
          .startOf("day");
        if (!recurring_date.isSameOrAfter(start_date))
          return throwError(returnMessage("activity", "invalidRecurringDate"));
      }

      const status = await ActivityStatus.findOne({ name: "pending" }).lean();

      payload.attendees?.push(user?._id.toString());
      payload.attendees = [
        ...new Set(payload?.attendees?.map((attendee) => attendee.toString())),
      ].map((attendee) => new mongoose.Types.ObjectId(attendee));

      const create_data = {
        activity_status: status?._id,
        created_by: user?._id,
        agenda,
        title,
        internal_info,
        meeting_start_time: start_time,
        meeting_end_time: end_time,
        meeting_date: start_date,
        recurrence_end_date: recurring_date,
        attendees: payload?.attendees,
        workspace_id: user?.workspace,
        all_day,
        alert_time,
        alert_time_unit,
        ...(google_meet_link && { google_meeting_data: google_meet_link }),
        recurrence_pattern,
        recurrence_interval,
        weekly_recurrence_days,
        monthly_recurrence_day_of_month,
      };

      const newActivity = await Activity.create(create_data);

      // const event = {
      //   start: [
      //     moment(start_date).year(),
      //     moment(start_date).month() + 1, // Months are zero-based in JavaScript Date objects
      //     moment(start_date).date(),
      //     moment(payload.meeting_start_time, "HH:mm").hour(), // Use .hour() to get the hour as a number
      //     moment(payload.meeting_start_time, "HH:mm").minute(),
      //   ],
      //   end: [
      //     moment(recurring_date).year(),
      //     moment(recurring_date).month() + 1, // Months are zero-based in JavaScript Date objects
      //     moment(recurring_date).date(),
      //     moment(payload.meeting_end_time, "HH:mm").hour(), // Use .hour() to get the hour as a number
      //     moment(payload.meeting_end_time, "HH:mm").minute(),
      //   ],

      //   title: title,
      //   description: agenda,
      //   // Other optional properties can be added here such as attendees, etc.
      // };

      // // const file = await new Promise((resolve, reject) => {
      // //   const filename = "ExampleEvent.ics";
      // //   ics.createEvent(event, (error, value) => {
      // //     if (error) {
      // //       reject(error);
      // //     }

      // //     resolve(value, filename, { type: "text/calendar" });
      // //   });
      // // });

      // // if (user?.role?.name === "agency") {
      // //   // --------------- Start--------------------
      // //   const [assign_to_data, client_data, attendees_data] = await Promise.all(
      // //     [
      // //       Authentication.findOne({ reference_id: assign_to }).lean(),
      // //       Authentication.findOne({ reference_id: client_id }).lean(),
      // //       Authentication.find({ reference_id: { $in: attendees } }).lean(),
      // //     ]
      // //   );

      // //   const activity_email_template = activityTemplate({
      // //     ...payload,
      // //     status: mark_as_done ? "completed" : "pending",
      // //     assigned_by_name: user.first_name + " " + user.last_name,
      // //     client_name: client_data
      // //       ? client_data.first_name + " " + client_data.last_name
      // //       : "",
      // //     assigned_to_name:
      // //       assign_to_data.first_name + " " + assign_to_data.last_name,
      // //     meeting_start_time: momentTimezone
      // //       .utc(meeting_start_time, "HH:mm")
      // //       .tz("Asia/Kolkata")
      // //       .format("HH:mm"),

      // //     meeting_end_time: momentTimezone
      // //       .utc(meeting_end_time, "HH:mm")
      // //       .tz("Asia/Kolkata")
      // //       .format("HH:mm"),
      // //   });

      // //   client_data &&
      // //     sendEmail({
      // //       email: client_data?.email,
      // //       subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //       message: activity_email_template,
      // //       icsContent: file,
      // //     });
      // //   sendEmail({
      // //     email: assign_to_data?.email,
      // //     subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //     message: activity_email_template,
      // //     icsContent: file,
      // //   });

      // //   attendees_data &&
      // //     attendees_data[0] &&
      // //     attendees_data.map((item) => {
      // //       const activity_email_template = activityTemplate({
      // //         ...payload,
      // //         status: mark_as_done ? "completed" : "pending",
      // //         assigned_by_name: user.first_name + " " + user.last_name,
      // //         client_name: client_data
      // //           ? client_data.first_name + " " + client_data.last_name
      // //           : "",
      // //         assigned_to_name:
      // //           assign_to_data.first_name + " " + assign_to_data.last_name,
      // //       });

      // //       sendEmail({
      // //         email: item?.email,
      // //         subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //         message: activity_email_template,
      // //         icsContent: file,
      // //       });
      // //     });
      // //   await notificationService.addNotification(
      // //     {
      // //       assign_by: user?.reference_id,
      // //       assigned_by_name: user?.first_name + " " + user?.last_name,
      // //       client_name: client_data
      // //         ? client_data.first_name + " " + client_data.last_name
      // //         : "",
      // //       assigned_to_name:
      // //         assign_to_data?.first_name + " " + assign_to_data?.last_name,
      // //       ...payload,
      // //       module_name: "activity",
      // //       activity_type_action: "create_call_meeting",
      // //       activity_type:
      // //         activity_type === "others" ? "activity" : "call meeting",
      // //       meeting_start_time: momentTimezone
      // //         .utc(meeting_start_time, "HH:mm")
      // //         .tz("Asia/Kolkata")
      // //         .format("HH:mm"),
      // //       meeting_end_time: momentTimezone
      // //         .utc(meeting_end_time, "HH:mm")
      // //         .tz("Asia/Kolkata")
      // //         .format("HH:mm"),
      // //     },
      // //     newActivity?._id
      // //   );
      // //   // ---------------- End ---------------
      // // }
      // // if (user?.role?.name === "team_agency") {
      // //   // --------------- Start--------------------
      // //   const [assign_to_data, client_data, attendees_data] = await Promise.all(
      // //     [
      // //       Authentication.findOne({ reference_id: assign_to }).lean(),
      // //       Authentication.findOne({ reference_id: client_id }).lean(),
      // //       Authentication.find({ reference_id: { $in: attendees } }).lean(),
      // //     ]
      // //   );

      // //   const activity_email_template = activityTemplate({
      // //     ...payload,
      // //     status: mark_as_done ? "completed" : "pending",
      // //     assigned_by_name: user.first_name + " " + user.last_name,
      // //     client_name: client_data
      // //       ? client_data.first_name + " " + client_data.last_name
      // //       : "",
      // //     assigned_to_name:
      // //       assign_to_data.first_name + " " + assign_to_data.last_name,
      // //     meeting_start_time: momentTimezone
      // //       .utc(meeting_start_time, "HH:mm")
      // //       .tz("Asia/Kolkata")
      // //       .format("HH:mm"),

      // //     meeting_end_time: momentTimezone
      // //       .utc(meeting_end_time, "HH:mm")
      // //       .tz("Asia/Kolkata")
      // //       .format("HH:mm"),
      // //   });

      // //   client_data &&
      // //     sendEmail({
      // //       email: client_data?.email,
      // //       subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //       message: activity_email_template,
      // //       icsContent: file,
      // //     });
      // //   sendEmail({
      // //     email: assign_to_data?.email,
      // //     subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //     message: activity_email_template,
      // //     icsContent: file,
      // //   });

      // //   attendees_data &&
      // //     attendees_data[0] &&
      // //     attendees_data.map((item) => {
      // //       const activity_email_template = activityTemplate({
      // //         ...payload,
      // //         status: mark_as_done ? "completed" : "pending",
      // //         assigned_by_name: user.first_name + " " + user.last_name,
      // //         client_name: client_data
      // //           ? client_data.first_name + " " + client_data.last_name
      // //           : "",
      // //         assigned_to_name:
      // //           assign_to_data.first_name + " " + assign_to_data.last_name,

      // //         meeting_start_time: momentTimezone
      // //           .utc(meeting_start_time, "HH:mm")
      // //           .tz("Asia/Kolkata")
      // //           .format("HH:mm"),

      // //         meeting_end_time: momentTimezone
      // //           .utc(meeting_end_time, "HH:mm")
      // //           .tz("Asia/Kolkata")
      // //           .format("HH:mm"),
      // //       });

      // //       sendEmail({
      // //         email: item?.email,
      // //         subject: returnMessage("emailTemplate", "newActivityMeeting"),
      // //         message: activity_email_template,
      // //         icsContent: file,
      // //       });
      // //     });

      // //   const agencyData = await Authentication.findOne({
      // //     reference_id: newActivity?.agency_id,
      // //   });

      // //   await notificationService.addNotification(
      // //     {
      // //       agency_name: agencyData?.first_name + " " + agencyData?.last_name,
      // //       agency_id: agencyData?.reference_id,
      // //       assign_by: user?.reference_id,
      // //       assigned_by_name: user?.first_name + " " + user?.last_name,
      // //       client_name: client_data
      // //         ? client_data.first_name + " " + client_data.last_name
      // //         : "",
      // //       assigned_to_name:
      // //         assign_to_data?.first_name + " " + assign_to_data?.last_name,
      // //       ...payload,
      // //       module_name: "activity",
      // //       activity_type_action: "create_call_meeting",
      // //       activity_type:
      // //         activity_type === "others" ? "activity" : "call meeting",
      // //       log_user: "member",
      // //       meeting_start_time: momentTimezone
      // //         .utc(meeting_start_time, "HH:mm")
      // //         .tz("Asia/Kolkata")
      // //         .format("HH:mm"),
      // //       meeting_end_time: momentTimezone
      // //         .utc(meeting_end_time, "HH:mm")
      // //         .tz("Asia/Kolkata")
      // //         .format("HH:mm"),
      // //     },
      // //     newActivity?._id
      // //   );
      // //   // ---------------- End ---------------
      // // }

      return;
    } catch (error) {
      logger.error(`Error while creating call meeting and other: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  activityStatus = async () => {
    try {
      return await ActivityStatus.find({});
    } catch (error) {
      logger.error(`Error while activity status list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getActivityById = async (id) => {
    try {
      const taskPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "created_by",
            foreignField: "_id",
            as: "created_by",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  assigned_by_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "attendees",
            foreignField: "_id",
            as: "attendeesData",
            pipeline: [
              {
                $project: {
                  email: 1,
                  _id: 1,
                  profile_image: 1,
                  first_name: 1,
                  last_name: 1,
                  attendees_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
        },
        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            is_deleted: false,
          },
        },
        {
          $project: {
            title: 1,
            due_time: 1,
            meeting_date: 1,
            createdAt: 1,
            status: "$status.name",
            agenda: 1,
            assigned_by_name: "$created_by.name",
            assigned_by_first_name: "$created_by.first_name",
            assigned_by_last_name: "$created_by.last_name",
            assigned_by_name: {
              $concat: ["$created_by.first_name", " ", "$created_by.last_name"],
            },
            meeting_start_time: 1,
            meeting_end_time: 1,
            attendees: "$attendeesData",
            internal_info: 1,
            all_day: 1,
            google_meet_link: 1,
            alert_time_unit: 1,
            alert_time: 1,
            recurrence_pattern: 1,
            recurrence_interval: 1,
            weekly_recurrence_days: 1,
            monthly_recurrence_day_of_month: 1,
            recurrence_end_date: 1,
            google_meeting_data: 1,
          },
        },
      ];
      const activity = await Activity.aggregate(taskPipeline);

      return activity;
    } catch (error) {
      logger.error(`Error while fetching data: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  deleteActivity = async (payload) => {
    const { taskIdsToDelete } = payload;
    try {
      await Activity.updateMany(
        { _id: { $in: taskIdsToDelete } },
        { $set: { is_deleted: true } }
      );

      // const pipeline = [
      //   {
      //     $lookup: {
      //       from: "authentications",
      //       localField: "assign_by",
      //       foreignField: "_id",
      //       as: "assign_by",
      //       pipeline: [
      //         {
      //           $project: {
      //             name: 1,
      //             first_name: 1,
      //             last_name: 1,
      //             assigned_by_name: {
      //               $concat: ["$first_name", " ", "$last_name"],
      //             },
      //           },
      //         },
      //       ],
      //     },
      //   },
      //   {
      //     $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
      //   },
      //   {
      //     $lookup: {
      //       from: "activity_status_masters",
      //       localField: "activity_status",
      //       foreignField: "_id",
      //       as: "status",
      //       pipeline: [{ $project: { name: 1 } }],
      //     },
      //   },
      //   {
      //     $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
      //   },
      //   {
      //     $match: {
      //       _id: {
      //         $in: taskIdsToDelete.map((id) => new mongoose.Types.ObjectId(id)),
      //       },
      //     },
      //   },
      //   {
      //     $project: {
      //       agenda: 1,
      //       status: "$status.name",
      //       assigned_by_first_name: "$assign_by.first_name",
      //       assigned_by_last_name: "$assign_by.last_name",
      //       assigned_by_name: "$assign_by.assigned_by_name",
      //       column_id: "$status.name",
      //       meeting_date: 1,
      //       due_time: 1,
      //       title: 1,
      //     },
      //   },
      // ];
      // const getTask = await Activity.aggregate(pipeline);
      // getTask.forEach(async (task) => {
      //   const board = await Board.findOne({ _id: task?.board_id }).lean();

      //   let data = {
      //     TaskTitle: "Deleted Task",
      //     taskName: task?.title,
      //     status: task?.status,
      //     assign_by: task?.assigned_by_name,
      //     dueDate: moment(task?.meeting_date)?.format("DD/MM/YYYY"),
      //     dueTime: task?.due_time,
      //     agginTo_email: task?.assign_email,
      //     assignName: task?.assigned_to_name,
      //     board_name: board ? board?.project_name : "",
      //   };
      //   const taskMessage = taskTemplate(data);
      //   const clientData = await Authentication.findOne({
      //     reference_id: task?.client_id,
      //   }).lean();
      //   await sendEmail({
      //     email: task?.assign_email,
      //     subject: returnMessage("activity", "taskDeleted"),
      //     message: taskMessage,
      //   });

      //   if (clientData) {
      //     await sendEmail({
      //       email: clientData?.email,
      //       subject: returnMessage("activity", "taskDeleted"),
      //       message: taskTemplate({
      //         ...data,
      //         assignName: clientData.first_name + " " + clientData.last_name,
      //       }),
      //     });
      //   }

      //   await notificationService.addNotification(
      //     {
      //       title: task?.title,
      //       module_name: "task",
      //       activity_type_action: "deleted",
      //       activity_type: "task",
      //       assign_to: task?.assign_to,
      //       client_id: task?.client_id,
      //     },
      //     task?._id
      //   );
      //   return;
      // });

      return;
    } catch (error) {
      logger.error(`Error while Deleting task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  statusUpdate = async (payload, id, user) => {
    try {
      const { status } = payload;
      let update_status;
      if (status === "completed") {
        update_status = await ActivityStatus.findOne({
          name: "completed",
        }).lean();
      } else if (status === "pending") {
        update_status = await ActivityStatus.findOne({
          name: "pending",
        }).lean();
      } else if (status === "in_progress") {
        update_status = await ActivityStatus.findOne({
          name: "in_progress",
        }).lean();
      } else if (status === "overdue") {
        update_status = await ActivityStatus.findOne({
          name: "overdue",
        }).lean();
      } else if (status === "cancel") {
        update_status = await ActivityStatus.findOne({
          name: "cancel",
        }).lean();
      }
      const get_activity = await Activity.findById(id).lean();

      if (status === "cancel") {
        if (get_activity?.google_meeting_data?.meet_link) {
          google_meet_link = await this.deleteGoogleMeeting({ ...payload });
        }
      }

      if (payload?.google_meeting) {
        google_meet_link = await this.createCallGoogleMeeting(payload);
      }
      const updateTasks = await Activity.findByIdAndUpdate(
        {
          _id: id,
        },
        {
          activity_status: update_status._id,
        },
        { new: true, useFindAndModify: false }
      );

      // const pipeline = [
      //   {
      //     $lookup: {
      //       from: "authentications",
      //       localField: "assign_by",
      //       foreignField: "_id",
      //       as: "assign_by",
      //       pipeline: [
      //         {
      //           $project: {
      //             name: 1,
      //             first_name: 1,
      //             last_name: 1,
      //             assigned_by_name: {
      //               $concat: ["$first_name", " ", "$last_name"],
      //             },
      //           },
      //         },
      //       ],
      //     },
      //   },
      //   {
      //     $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
      //   },

      //   {
      //     $match: {
      //       _id: new mongoose.Types.ObjectId(id),
      //       is_deleted: false,
      //     },
      //   },
      //   {
      //     $project: {
      //       agenda: 1,
      //       assigned_first_name: "$assign_by.first_name",
      //       assigned_last_name: "$assign_by.last_name",
      //       assigned_name: "$assign_by.assigned_by_name",
      //       column_id: "$status.name",
      //       meeting_date: 1,
      //       due_time: 1,
      //       title: 1,
      //       meeting_start_time: 1,
      //       meeting_end_time: 1,
      //       recurring_end_date: 1,
      //       assign_by: 1,
      //       attendees: 1,
      //     },
      //   },
      // ];

      // const getTask = await Activity.aggregate(pipeline);
      // const [assign_to_data, client_data, attendees_data, board] =
      //   await Promise.all([
      //     Authentication.findOne({ reference_id: getTask[0]?.assign_to }),
      //     Authentication.findOne({ reference_id: getTask[0]?.client_id }),
      //     Authentication.find({
      //       reference_id: { $in: getTask[0]?.attendees },
      //     }).lean(),
      //     Board.findOne({ _id: getTask[0]?.board_id }).lean(),
      //   ]);

      // let task_status;
      // let emailTempKey;
      // if (payload.status == "cancel") {
      //   task_status = "cancel";
      //   emailTempKey = "meetingCancelled";
      // }
      // if (payload.status == "completed") {
      //   task_status = "completed";
      //   emailTempKey = "activityCompleted";
      // }
      // if (payload.status == "in_progress") {
      //   task_status = "inProgress";
      //   emailTempKey = "activityInProgress";
      // }
      // if (payload.status == "pending") {
      //   task_status = "pending";
      //   emailTempKey = "activityInPending";
      // }
      // if (payload.status == "overdue") {
      //   task_status = "overdue";
      //   emailTempKey = "activityInOverdue";
      // }
      // if (getTask[0].activity_type === "task") {
      //   let data = {
      //     TaskTitle: "Updated Task status",
      //     taskName: getTask[0]?.title,
      //     status: payload.status,
      //     assign_by: getTask[0]?.assigned_by_name,
      //     dueDate: moment(getTask[0]?.meeting_date)?.format("DD/MM/YYYY"),
      //     dueTime: getTask[0]?.due_time,
      //     agginTo_email: getTask[0]?.assign_email,
      //     assignName: getTask[0]?.assigned_to_name,
      //     board_name: board ? board?.project_name : "",
      //   };
      //   const taskMessage = taskTemplate(data);
      //   sendEmail({
      //     email: getTask[0]?.assign_email,
      //     subject: returnMessage("activity", "UpdateSubject"),
      //     message: taskMessage,
      //   });

      //   if (client_data) {
      //     sendEmail({
      //       email: client_data?.email,
      //       subject: returnMessage("activity", "UpdateSubject"),
      //       message: taskTemplate({
      //         ...data,
      //         assignName: client_data.first_name + " " + client_data.last_name,
      //         board_name: board ? board?.project_name : "",
      //       }),
      //     });
      //   }

      //   if (user?.role?.name === "agency") {
      //     //   ----------    Notifications start ----------
      //     await notificationService.addNotification(
      //       {
      //         client_name: client_data
      //           ? client_data?.first_name + " " + client_data?.last_name
      //           : "",
      //         assigned_to_name:
      //           assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //         ...getTask[0],
      //         module_name: "task",
      //         activity_type_action: task_status,
      //         activity_type: "task",
      //         meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
      //           "HH:mm"
      //         ),
      //         meeting_date: moment(getTask[0]?.meeting_date).format("DD-MM-YYYY"),
      //         board_name: board ? board?.project_name : "",
      //       },
      //       id
      //     );
      //     //   ----------    Notifications end ----------
      //   }

      //   if (
      //     user.role.name === "team_agency" ||
      //     user.role.name === "team_client"
      //   ) {
      //     const agencyData = await Authentication.findById(
      //       getTask[0].assign_by._id
      //     );

      //     //   ----------    Notifications start ----------
      //     await notificationService.addNotification(
      //       {
      //         client_name: client_data
      //           ? client_data.first_name + " " + client_data.last_name
      //           : "",
      //         agency_name: agencyData?.first_name + " " + agencyData?.last_name,
      //         assigned_to_name:
      //           assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //         ...getTask[0],
      //         module_name: "task",
      //         log_user: "member",
      //         activity_type_action: task_status,
      //         activity_type: "task",
      //         meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
      //           "HH:mm"
      //         ),
      //         meeting_date: moment(getTask[0]?.meeting_date).format("DD-MM-YYYY"),
      //         assigned_by_name: getTask[0]?.assigned_by_name,
      //         assign_by: agencyData?.reference_id,
      //         board_name: board ? board?.project_name : "",
      //       },
      //       id
      //     );
      //     //   ----------    Notifications end ----------
      //   }
      // } else {
      //   //   ----------    Notifications start ----------
      //   if (user.role.name === "agency") {
      //     const activity_email_template = activityTemplate({
      //       ...getTask[0],
      //       activity_type: getTask[0]?.activity_type,
      //       meeting_start_time: momentTimezone(
      //         getTask[0]?.meeting_start_time,
      //         "HH:mm"
      //       )
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //       meeting_end_time: momentTimezone(
      //         getTask[0]?.meeting_end_time,
      //         "HH:mm"
      //       )
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //       recurring_end_date: getTask[0]?.recurring_end_date
      //         ? moment(getTask[0]?.recurring_end_date).format("DD-MM-YYYY")
      //         : null,
      //       meeting_date: moment(getTask[0]?.meeting_date).format("DD-MM-YYYY"),
      //       status: payload?.status,
      //       client_name: client_data
      //         ? client_data?.first_name + " " + client_data?.last_name
      //         : "",
      //     });
      //     client_data &&
      //       sendEmail({
      //         email: client_data?.email,
      //         subject: returnMessage("emailTemplate", emailTempKey),
      //         message: activity_email_template,
      //       });

      //     sendEmail({
      //       email: assign_to_data?.email,
      //       subject: returnMessage("emailTemplate", emailTempKey),
      //       message: activity_email_template,
      //     });

      //     attendees_data &&
      //       attendees_data[0] &&
      //       attendees_data.map((item) => {
      //         sendEmail({
      //           email: item?.email,
      //           subject: returnMessage("emailTemplate", emailTempKey),
      //           message: activity_email_template,
      //         });
      //       });

      //     //   ----------    Notifications start ----------

      //     await notificationService.addNotification(
      //       {
      //         client_name: client_data
      //           ? client_data?.first_name + " " + client_data?.last_name
      //           : "",
      //         assigned_to_name:
      //           assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //         ...getTask[0],
      //         module_name: "activity",
      //         activity_type_action: task_status,
      //         activity_type:
      //           getTask[0]?.activity_type.name === "others"
      //             ? "activity"
      //             : "call meeting",
      //         meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
      //           "HH:mm"
      //         ),
      //         meeting_date: moment(getTask[0]?.meeting_date).format("DD-MM-YYYY"),
      //         tags: getTask[0]?.tags,
      //         board_name: board ? board?.project_name : "",
      //       },
      //       id
      //     );
      //     //   ----------    Notifications end ----------
      //   }

      //   if (
      //     user.role.name === "team_agency" ||
      //     user.role.name === "team_client"
      //   ) {
      //     const agencyData = await Authentication.findById(
      //       getTask[0].assign_by._id
      //     );

      //     const activity_email_template = activityTemplate({
      //       ...getTask[0],
      //       activity_type: getTask[0]?.activity_type,
      //       meeting_end_time: moment(getTask[0]?.meeting_end_time).format(
      //         "HH:mm"
      //       ),
      //       meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
      //         "HH:mm"
      //       ),
      //       recurring_end_date: getTask[0]?.recurring_end_date
      //         ? moment(getTask[0]?.recurring_end_date).format("DD-MM-YYYY")
      //         : null,
      //       meeting_date: moment(getTask[0].meeting_date).format("DD-MM-YYYY"),
      //       status: payload?.status,
      //       client_name: client_data
      //         ? client_data?.first_name + " " + client_data?.last_name
      //         : "",
      //     });
      //     client_data &&
      //       sendEmail({
      //         email: client_data?.email,
      //         subject: returnMessage("emailTemplate", emailTempKey),
      //         message: activity_email_template,
      //       });
      //     sendEmail({
      //       email: assign_to_data?.email,
      //       subject: returnMessage("emailTemplate", emailTempKey),
      //       message: activity_email_template,
      //     });

      //     attendees_data &&
      //       attendees_data[0] &&
      //       attendees_data.map((item) => {
      //         sendEmail({
      //           email: item?.email,
      //           subject: returnMessage("emailTemplate", emailTempKey),
      //           message: activity_email_template,
      //         });
      //       });

      //     //   ----------    Notifications start ----------

      //     await notificationService.addNotification(
      //       {
      //         client_name: client_data
      //           ? client_data?.first_name + " " + client_data?.last_name
      //           : "",
      //         assigned_to_name:
      //           assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //         ...getTask[0],
      //         module_name: "activity",
      //         activity_type_action: task_status,
      //         activity_type:
      //           getTask[0]?.activity_type.name === "others"
      //             ? "activity"
      //             : "call meeting",
      //         meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
      //           "HH:mm"
      //         ),
      //         meeting_date: moment(getTask[0]?.meeting_date).format("DD-MM-YYYY"),
      //         tags: getTask[0].tags,
      //         log_user: "member",
      //         assigned_by_name: getTask[0]?.assigned_by_name,
      //         assign_by: agencyData?.reference_id,
      //       },
      //       id
      //     );
      //     //   ----------    Notifications end ----------
      //   }
      // }
      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating status, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to update the call type activity or other
  updateActivity = async (activity_id, payload, user) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;

      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      const activity_exist = await Activity.findById(activity_id)
        .populate("activity_status")
        .lean();
      if (!activity_exist)
        return throwError(
          returnMessage("activity", "activityNotFound"),
          statusCode.notFound
        );

      const output_date = moment(activity_exist?.meeting_date).format(
        "DD-MM-YYYY"
      );
      const output_time = moment(activity_exist?.meeting_start_time)
        .tz("Asia/Kolkata")
        .format("HH:mm");

      let google_meet_link;

      if (
        payload?.meeting_date !== output_date &&
        payload?.meeting_start_time !== output_time &&
        payload?.google_meeting
      ) {
        google_meet_link = await this.updateGoogleMeeting(payload);
      }

      if (activity_exist?.activity_status?.name === "completed") {
        return throwError(returnMessage("activity", "ActivityCannotUpdate"));
      }
      validateRequestFields(payload, [
        "title",
        "meeting_start_time",
        "meeting_end_time",
        "meeting_date",
      ]);

      const {
        title,
        agenda,
        meeting_date,
        meeting_start_time,
        meeting_end_time,
        internal_info,
        attendees,
        recurrence_pattern,
        recurrence_interval,
        weekly_recurrence_days,
        monthly_recurrence_day_of_month,
        all_day,
      } = payload;

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(meeting_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${meeting_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${meeting_date}-${meeting_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("activity", "dateinvalid"));

      if (!end_time.isSameOrAfter(start_time))
        return throwError(returnMessage("activity", "invalidTime"));

      if (payload?.recurrence_end_date) {
        recurring_date = moment
          .utc(payload?.recurrence_end_date, "DD-MM-YYYY")
          .startOf("day");
        if (!recurring_date.isSameOrAfter(start_date))
          return throwError(returnMessage("activity", "invalidRecurringDate"));
      }

      payload.attendees?.push(user?._id.toString());
      payload.attendees = [
        ...new Set(payload?.attendees?.map((attendee) => attendee.toString())),
      ].map((attendee) => new mongoose.Types.ObjectId(attendee));

      const status = await ActivityStatus.findOne({ name: "pending" }).lean();
      await Activity.findByIdAndUpdate(
        activity_id,
        {
          activity_status: status?._id,
          assign_by: user?._id,
          agenda,
          title,
          internal_info,
          meeting_start_time: start_time,
          meeting_end_time: end_time,
          meeting_date: start_date,
          recurrence_end_date: recurring_date,
          attendees: payload?.attendees,
          ...(google_meet_link && { google_meeting_data: google_meet_link }),
          recurrence_pattern,
          recurrence_interval,
          weekly_recurrence_days,
          monthly_recurrence_day_of_month,
          all_day,
        },
        { new: true }
      );
      // if (user?.role?.name === "agency") {
      //   // --------------- Start--------------------
      //   let task_status = "update";
      //   let emailTempKey = "activityUpdated";
      //   if (payload.mark_as_done) {
      //     task_status = "completed";
      //     emailTempKey = "activityCompleted";
      //   }

      //   const [assign_to_data, client_data, attendees_data] = await Promise.all(
      //     [
      //       Authentication.findOne({ reference_id: assign_to }),
      //       Authentication.findOne({ reference_id: client_id }),
      //       Authentication.find({ reference_id: { $in: attendees } }).lean(),
      //     ]
      //   );
      //   const activity_email_template = activityTemplate({
      //     ...payload,
      //     status: payload.mark_as_done ? "completed" : "pending",
      //     assigned_by_name: user.first_name + " " + user.last_name,
      //     client_name: client_data
      //       ? client_data.first_name + " " + client_data.last_name
      //       : "",
      //     assigned_to_name:
      //       assign_to_data.first_name + " " + assign_to_data.last_name,
      //     meeting_start_time: momentTimezone
      //       .utc(meeting_start_time, "HH:mm")
      //       .tz("Asia/Kolkata")
      //       .format("HH:mm"),

      //     meeting_end_time: momentTimezone
      //       .utc(meeting_end_time, "HH:mm")
      //       .tz("Asia/Kolkata")
      //       .format("HH:mm"),
      //   });

      //   client_data &&
      //     sendEmail({
      //       email: client_data?.email,
      //       subject: returnMessage("emailTemplate", emailTempKey),
      //       message: activity_email_template,
      //     });
      //   sendEmail({
      //     email: assign_to_data?.email,
      //     subject: returnMessage("emailTemplate", emailTempKey),
      //     message: activity_email_template,
      //   });

      //   attendees_data &&
      //     attendees_data[0] &&
      //     attendees_data.map((item) => {
      //       const activity_email_template = activityTemplate({
      //         ...payload,
      //         status: payload.mark_as_done ? "completed" : "pending",
      //         assigned_by_name: user.first_name + " " + user.last_name,
      //         client_name: client_data
      //           ? client_data.first_name + " " + client_data.last_name
      //           : "",
      //         assigned_to_name:
      //           assign_to_data.first_name + " " + assign_to_data.last_name,
      //         meeting_start_time: momentTimezone
      //           .utc(meeting_start_time, "HH:mm")
      //           .tz("Asia/Kolkata")
      //           .format("HH:mm"),

      //         meeting_end_time: momentTimezone
      //           .utc(meeting_end_time, "HH:mm")
      //           .tz("Asia/Kolkata")
      //           .format("HH:mm"),
      //       });

      //       sendEmail({
      //         email: item?.email,
      //         subject: returnMessage("emailTemplate", emailTempKey),
      //         message: activity_email_template,
      //       });
      //     });

      //   await notificationService.addNotification(
      //     {
      //       assign_by: user?.reference_id,
      //       assigned_by_name: user?.first_name + " " + user?.last_name,
      //       client_name: client_data
      //         ? client_data.first_name + " " + client_data.last_name
      //         : "",
      //       assigned_to_name:
      //         assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //       ...payload,
      //       module_name: "activity",
      //       activity_type_action: task_status,
      //       activity_type:
      //         activity_type === "others" ? "activity" : "call meeting",
      //       meeting_start_time: momentTimezone
      //         .utc(meeting_start_time, "HH:mm")
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //       meeting_end_time: momentTimezone
      //         .utc(meeting_end_time, "HH:mm")
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //     },
      //     activity_id
      //   );
      //   // ---------------- End ---------------
      // }
      // if (user?.role?.name === "team_agency") {
      //   // --------------- Start--------------------
      //   let task_status = "update";
      //   let emailTempKey = "activityUpdated";
      //   if (payload.mark_as_done) {
      //     task_status = "completed";
      //     emailTempKey = "activityCompleted";
      //   }

      //   const [assign_to_data, client_data, attendees_data, agencyData] =
      //     await Promise.all([
      //       Authentication.findOne({ reference_id: assign_to }),
      //       Authentication.findOne({ reference_id: client_id }),
      //       Authentication.find({ reference_id: { $in: attendees } }).lean(),
      //       Authentication.findOne({
      //         reference_id: user?.agency_id
      //           ? user?.agency_id
      //           : user?.reference_id,
      //       }).lean(),
      //     ]);

      //   const activity_email_template = activityTemplate({
      //     ...payload,
      //     status: payload.mark_as_done ? "completed" : "pending",
      //     assigned_by_name: user.first_name + " " + user.last_name,
      //     client_name: client_data
      //       ? client_data.first_name + " " + client_data.last_name
      //       : "",
      //     assigned_to_name:
      //       assign_to_data.first_name + " " + assign_to_data.last_name,
      //     meeting_start_time: momentTimezone
      //       .utc(meeting_start_time, "HH:mm")
      //       .tz("Asia/Kolkata")
      //       .format("HH:mm"),

      //     meeting_end_time: momentTimezone
      //       .utc(meeting_end_time, "HH:mm")
      //       .tz("Asia/Kolkata")
      //       .format("HH:mm"),
      //   });

      //   client_data &&
      //     sendEmail({
      //       email: client_data?.email,
      //       subject: returnMessage("emailTemplate", emailTempKey),
      //       message: activity_email_template,
      //     });
      //   sendEmail({
      //     email: assign_to_data?.email,
      //     subject: returnMessage("emailTemplate", emailTempKey),
      //     message: activity_email_template,
      //   });

      //   attendees_data &&
      //     attendees_data[0] &&
      //     attendees_data.map((item) => {
      //       const activity_email_template = activityTemplate({
      //         ...payload,
      //         status: payload.mark_as_done ? "completed" : "pending",
      //         assigned_by_name: user.first_name + " " + user.last_name,
      //         client_name: client_data
      //           ? client_data.first_name + " " + client_data.last_name
      //           : "",
      //         assigned_to_name:
      //           assign_to_data.first_name + " " + assign_to_data.last_name,
      //         meeting_start_time: momentTimezone
      //           .utc(meeting_start_time, "HH:mm")
      //           .tz("Asia/Kolkata")
      //           .format("HH:mm"),

      //         meeting_end_time: momentTimezone
      //           .utc(meeting_end_time, "HH:mm")
      //           .tz("Asia/Kolkata")
      //           .format("HH:mm"),
      //       });

      //       sendEmail({
      //         email: item?.email,
      //         subject: returnMessage("emailTemplate", emailTempKey),
      //         message: activity_email_template,
      //       });
      //     });

      //   await notificationService.addNotification(
      //     {
      //       assign_by: user?.reference_id,
      //       assigned_by_name: user?.first_name + " " + user?.last_name,
      //       client_name: client_data
      //         ? client_data.first_name + " " + client_data.last_name
      //         : "",
      //       assigned_to_name:
      //         assign_to_data?.first_name + " " + assign_to_data?.last_name,
      //       ...payload,
      //       module_name: "activity",
      //       activity_type_action: task_status,
      //       activity_type:
      //         activity_type === "others" ? "activity" : "call meeting",
      //       agency_id: user?.agency_id ? user?.agency_id : user?.reference_id,
      //       agency_name: agencyData?.first_name + " " + agencyData?.last_name,
      //       log_user: "member",
      //       meeting_start_time: momentTimezone
      //         .utc(meeting_start_time, "HH:mm")
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //       meeting_end_time: momentTimezone
      //         .utc(meeting_end_time, "HH:mm")
      //         .tz("Asia/Kolkata")
      //         .format("HH:mm"),
      //     },
      //     activity_id
      //   );
      //   // ---------------- End ---------------
      // }
      return;
    } catch (error) {
      logger.error(`Error while updating call meeting and other: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for to get the activity with date and user based filter
  getActivities = async (payload, user) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;

      if (payload?.pagination) {
        return await this.getWithPaginationActivities(payload, user);
      }

      const match_obj = { $match: {} };
      const assign_obj = { $match: {} };
      if (payload?.given_date) {
        match_obj["$match"] = {
          meeting_date: {
            $eq: moment.utc(payload?.given_date, "DD-MM-YYYY").startOf("day"),
          },
        };
      }

      // this will used for the date filter in the listing
      const filter = {
        $match: {},
      };
      if (payload?.filter) {
        if (payload?.filter?.status === "in_progress") {
          const activity_status = await ActivityStatus.findOne({
            name: "in_progress",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "pending") {
          const activity_status = await ActivityStatus.findOne({
            name: "pending",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "overdue") {
          const activity_status = await ActivityStatus.findOne({
            name: "overdue",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "done") {
          const activity_status = await ActivityStatus.findOne({
            name: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }

        if (payload?.filter?.date === "today") {
          filter["$match"] = {
            ...filter["$match"],
            meeting_date: { $eq: new Date(moment.utc().startOf("day")) },
          };
        } else if (payload?.filter?.date === "tomorrow") {
          filter["$match"] = {
            ...filter["$match"],
            meeting_date: {
              $eq: new Date(moment.utc().add(1, "day").startOf("day")),
            },
          };
        } else if (payload?.filter?.date === "this_week") {
          filter["$match"] = {
            ...filter["$match"],
            $and: [
              {
                meeting_date: { $gte: new Date(moment.utc().startOf("week")) },
              },
              {
                meeting_date: { $lte: new Date(moment.utc().endOf("week")) },
              },
            ],
          };
        } else if (payload?.filter?.date === "period") {
          // need the start and end date to fetch the data between 2 dates

          if (
            !(payload?.filter?.start_date && payload?.filter?.end_date) &&
            payload?.filter?.start_date !== "" &&
            payload?.filter?.end_date !== ""
          )
            return throwError(
              returnMessage("activity", "startEnddateRequired")
            );

          const start_date = moment
            .utc(payload?.filter?.start_date, "DD-MM-YYYY")
            .startOf("day");
          const end_date = moment
            .utc(payload?.filter?.end_date, "DD-MM-YYYY")
            .endOf("day");

          if (end_date.isBefore(start_date))
            return throwError(returnMessage("activity", "invalidDate"));

          filter["$match"] = {
            ...filter["$match"],
            $or: [
              {
                $and: [
                  { meeting_date: { $gte: new Date(start_date) } },
                  { meeting_date: { $lte: new Date(end_date) } },
                ],
              },
              {
                $and: [
                  { meeting_date: { $gte: new Date(start_date) } },
                  { recurring_end_date: { $lte: new Date(end_date) } },
                ],
              },
            ],
          };
        }
      }

      const pagination = paginationObject(payload);
      if (user?.role === "agency") {
        assign_obj["$match"] = {
          is_deleted: false,
          workspace_id: new mongoose.Types.ObjectId(user?.workspace), // this is removed because agency can also assign the activity
        };
      } else if (user?.role === "team_agency") {
        assign_obj["$match"] = {
          $or: [{ created_by: user?._id }, { attendees: user?._id }],
          is_deleted: false,
        };
      } else if (user?.role === "client") {
        assign_obj["$match"] = {
          is_deleted: false,
          attendees: user?._id,
        };
      } else if (user?.role === "team_client") {
        assign_obj["$match"] = {
          is_deleted: false,
          attendees: user?._id,
        };
      }

      if (payload?.search && payload?.search !== "") {
        match_obj["$match"] = {
          ...match_obj["$match"],
          $or: [
            {
              title: {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              status: { $regex: payload?.search.toLowerCase(), $options: "i" },
            },
            {
              "assign_by.first_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_by.last_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_by.name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "activity_status.name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
          ],
        };
      }

      let aggragate = [
        assign_obj,
        match_obj,
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "attendees",
            foreignField: "_id",
            as: "attendeesData",
            pipeline: [
              {
                $project: {
                  email: 1,
                  _id: 1,
                  profile_image: 1,
                  first_name: 1,
                  last_name: 1,
                  attendees_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "activity_status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: {
            path: "$activity_status",
            preserveNullAndEmptyArrays: true,
          },
        },
      ];
      let activity, total_activity;
      activity = await Activity.aggregate(aggragate);
      let activity_array = [];
      activity.forEach((act) => {
        if (
          !payload?.given_date &&
          !payload?.filter &&
          act?.recurring_end_date
        ) {
          // this will give the activity based on the filter selected and recurring date activity
          if (payload?.filter?.date === "period") {
            act.recurring_end_date = moment
              .utc(payload?.filter?.end_date, "DD-MM-YYYY")
              .endOf("day");
          }
          const others_meetings = this.generateMeetingTimes(act);
          activity_array = [...activity_array, ...others_meetings];
          return;
        } else {
          let obj = {
            id: act?._id,
            title: act?.title,
            description: act?.agenda,
            allDay: act?.all_day,
            start: act?.meeting_start_time,
            end: act?.meeting_end_time,
            status: act?.activity_status?.name,
          };
          activity_array.push(obj);
        }
      });

      activity_array = [...activity_array];
      return activity_array;
    } catch (error) {
      logger.error(`Error while fetching the activity: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getWithPaginationActivities = async (payload, user) => {
    try {
      const match_obj = { $match: {} };
      const assign_obj = { $match: {} };
      if (payload?.given_date) {
        match_obj["$match"] = {
          meeting_date: {
            $eq: moment.utc(payload?.given_date, "DD-MM-YYYY").startOf("day"),
          },
        };
      }

      // this will used for the date filter in the listing
      const filter = {
        $match: {},
      };
      if (payload?.filter) {
        if (payload?.filter?.status === "in_progress") {
          const activity_status = await ActivityStatus.findOne({
            name: "in_progress",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "pending") {
          const activity_status = await ActivityStatus.findOne({
            name: "pending",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "overdue") {
          const activity_status = await ActivityStatus.findOne({
            name: "overdue",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (payload?.filter?.status === "done") {
          const activity_status = await ActivityStatus.findOne({
            name: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }

        if (payload?.filter?.date === "today") {
          filter["$match"] = {
            ...filter["$match"],
            meeting_date: { $eq: new Date(moment.utc().startOf("day")) },
          };
        } else if (payload?.filter?.date === "tomorrow") {
          filter["$match"] = {
            ...filter["$match"],
            meeting_date: {
              $eq: new Date(moment.utc().add(1, "day").startOf("day")),
            },
          };
        } else if (payload?.filter?.date === "this_week") {
          filter["$match"] = {
            ...filter["$match"],
            $and: [
              {
                meeting_date: { $gte: new Date(moment.utc().startOf("week")) },
              },
              {
                meeting_date: { $lte: new Date(moment.utc().endOf("week")) },
              },
            ],
          };
        } else if (payload?.filter?.date === "period") {
          // need the start and end date to fetch the data between 2 dates

          if (
            !(payload?.filter?.start_date && payload?.filter?.end_date) &&
            payload?.filter?.start_date !== "" &&
            payload?.filter?.end_date !== ""
          )
            return throwError(
              returnMessage("activity", "startEnddateRequired")
            );

          const start_date = moment
            .utc(payload?.filter?.start_date, "DD-MM-YYYY")
            .startOf("day");
          const end_date = moment
            .utc(payload?.filter?.end_date, "DD-MM-YYYY")
            .endOf("day");

          if (end_date.isBefore(start_date))
            return throwError(returnMessage("activity", "invalidDate"));

          filter["$match"] = {
            ...filter["$match"],
            $or: [
              {
                $and: [
                  { meeting_date: { $gte: new Date(start_date) } },
                  { meeting_date: { $lte: new Date(end_date) } },
                ],
              },
              {
                $and: [
                  { meeting_date: { $gte: new Date(start_date) } },
                  { recurring_end_date: { $lte: new Date(end_date) } },
                ],
              },
            ],
          };
        }
      }

      const pagination = paginationObject(payload);
      if (user?.role === "agency") {
        assign_obj["$match"] = {
          is_deleted: false,
          workspace_id: new mongoose.Types.ObjectId(user?.workspace), // this is removed because agency can also assign the activity
        };
      } else if (user?.role === "team_agency") {
        assign_obj["$match"] = {
          $or: [{ created_by: user?._id }, { attendees: user?._id }],
          is_deleted: false,
        };
      } else if (user?.role === "client") {
        assign_obj["$match"] = {
          is_deleted: false,
          attendees: new mongoose.Types.ObjectId(user?._id),
        };
      } else if (user?.role === "team_client") {
        assign_obj["$match"] = {
          is_deleted: false,
          attendees: user?._id,
        };
      }

      if (payload?.search && payload?.search !== "") {
        match_obj["$match"] = {
          ...match_obj["$match"],
          $or: [
            {
              title: {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              status: { $regex: payload?.search.toLowerCase(), $options: "i" },
            },
            {
              "assign_by.first_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_by.last_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_by.name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "activity_status.name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
          ],
        };
      }
      let aggragate = [
        assign_obj,
        match_obj,
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "attendees",
            foreignField: "_id",
            as: "attendeesData",
            pipeline: [
              {
                $project: {
                  email: 1,
                  _id: 1,
                  profile_image: 1,
                  first_name: 1,
                  last_name: 1,
                  attendees_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "activity_status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: {
            path: "$activity_status",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            is_deleted: false,
          },
        },
        {
          $project: {
            title: 1,
            due_time: 1,
            meeting_date: 1,
            createdAt: 1,
            status: "$activity_status.name",
            agenda: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: {
              $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
            },
            meeting_start_time: 1,
            meeting_end_time: 1,
            attendees: "$attendeesData",
            internal_info: 1,
            all_day: 1,
            google_meet_link: 1,
            alert_time_unit: 1,
            alert_time: 1,
            recurrence_pattern: 1,
            recurrence_interval: 1,
            weekly_recurrence_days: 1,
            monthly_recurrence_day_of_month: 1,
            recurrence_end_date: 1,
            workspace_id: 1,
          },
        },
      ];

      const [activity, total_activity] = await Promise.all([
        Activity.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Activity.aggregate(aggragate),
      ]);

      return {
        activity,
        page_count:
          Math.ceil(total_activity.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while fetching the activity: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for the only generate the calandar view objects only
  // because we need to generate the between dates from the start and recurring date

  generateMeetingTimes = (activity_obj) => {
    const meetingTimes = [];
    let current_meeting_start = moment.utc(activity_obj?.meeting_start_time);
    const meeting_end = moment.utc(activity_obj?.meeting_end_time);
    const recurring_end = moment.utc(activity_obj?.recurring_end_date);

    // Generate meeting times till recurring end time
    while (current_meeting_start.isBefore(recurring_end)) {
      const currentMeetingEnd = moment
        .utc(current_meeting_start)
        .add(
          meeting_end.diff(activity_obj?.meeting_start_time),
          "milliseconds"
        );
      meetingTimes.push({
        id: activity_obj?._id,
        title: activity_obj?.title,
        description: activity_obj?.agenda,
        allDay: false,
        start: current_meeting_start.format(),
        end: currentMeetingEnd.format(),
      });
      current_meeting_start.add(1, "day"); // Increment meeting start time by one day
    }

    return meetingTimes;
  };

  // this function is used for the only generate the calandar view objects only for event
  // because we need to generate the between dates from the start and recurring date
  generateEventTimes = (activity_obj) => {
    const meetingTimes = [];
    let current_meeting_start = moment.utc(activity_obj?.event_start_time);
    const meeting_end = moment.utc(activity_obj?.event_end_time);
    const recurring_end = moment.utc(activity_obj?.recurring_end_date);

    // Generate event times till recurring end time
    while (current_meeting_start.isBefore(recurring_end)) {
      const currentMeetingEnd = moment
        .utc(current_meeting_start)
        .add(meeting_end.diff(activity_obj?.event_start_time), "milliseconds");
      meetingTimes.push({
        id: activity_obj?._id,
        title: activity_obj?.title,
        description: activity_obj?.agenda,
        allDay: false,
        start: current_meeting_start.format(),
        end: currentMeetingEnd.format(),
        type: "event",
      });
      current_meeting_start.add(1, "day"); // Increment event start time by one day
    }

    return meetingTimes;
  };
  // Overdue crone Job

  overdueCronJob = async () => {
    try {
      const currentDate = moment();
      const overdue = await Section.findOne({
        key: "overdue",
      });
      const completed = await Section.findOne({
        key: "completed",
      });
      const overdueActivities = await Activity.find({
        meeting_date: { $lt: currentDate.toDate() },
        activity_status: {
          $nin: [overdue._id, completed._id],
        },
        is_deleted: false,
      }).populate("activity_type");

      for (const activity of overdueActivities) {
        if (activity.activity_type.name === "task") {
          activity.activity_status = overdue._id;
          await activity.save();
          activity?.assign_to?.forEach(async (member) => {
            await notificationService.addNotification({
              module_name: "task",
              activity_type_action: "overdue",
              title: activity.title,
              assign_to: member,
            });
          });
        }
      }
    } catch (error) {
      logger.error(`Error while Overdue crone Job, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  meetingAlertCronJob = async (meetings) => {
    try {
      const currentUtcDate = moment().utc();

      meetings.forEach((meeting) => {
        const {
          alert_time,
          alert_time_unit,
          meeting_start_time,
          recurrence_pattern,
          recurrence_interval,
          recurrence_end_date,
          weekly_recurrence_days,
          monthly_recurrence_day_of_month,
        } = meeting;

        if (recurrence_pattern && alert_time && alert_time_unit) {
          let notificationTime;

          if (recurrence_pattern === "daily") {
            notificationTime = moment(meeting_start_time).clone();
            while (
              notificationTime.isBefore(currentUtcDate) &&
              notificationTime.isBefore(recurrence_end_date)
            ) {
              notificationTime.add(recurrence_interval, "days");
            }
            notificationTime.subtract(alert_time, alert_time_unit);
          } else if (recurrence_pattern === "weekly") {
            notificationTime = moment(meeting_start_time).clone();
            const currentDay = currentUtcDate.day();
            const targetDay = moment().day(weekly_recurrence_days).day();

            while (
              notificationTime.isBefore(currentUtcDate) &&
              notificationTime.isBefore(recurrence_end_date)
            ) {
              if (notificationTime.day() === targetDay) {
                notificationTime.add(recurrence_interval, "weeks");
              } else {
                notificationTime.add(1, "days");
              }
            }
            notificationTime.subtract(alert_time, alert_time_unit);
          } else if (recurrence_pattern === "monthly") {
            notificationTime = moment(meeting_start_time).clone();

            while (
              notificationTime.isBefore(currentUtcDate) &&
              notificationTime.isBefore(recurrence_end_date)
            ) {
              if (notificationTime.date() === monthly_recurrence_day_of_month) {
                notificationTime.add(recurrence_interval, "months");
              } else {
                notificationTime.add(1, "days");
              }
            }
            notificationTime.subtract(alert_time, alert_time_unit);
          }
        }

        // const activity_email_template = activityTemplate({
        //   ...data,
        //   status:
        //     activityStatusName?.name === "in_progress"
        //       ? "In Progress"
        //       : activityStatusName.name,
        //   assigned_by_name:
        //     assignByData?.first_name + " " + assignByData?.last_name,
        //   client_name: clientData
        //     ? clientData.first_name + " " + clientData.last_name
        //     : "",
        //   assigned_to_name:
        //     assignToData?.first_name + " " + assignToData?.last_name,

        //   activity_type: activityTypeName?.name,
        //   meeting_end_time: moment(data?.meeting_end_time).format("HH:mm"),
        //   meeting_start_time: moment(data?.meeting_start_time).format("HH:mm"),
        //   recurring_end_date: data?.recurring_end_date
        //     ? moment(data?.recurring_end_date).format("DD-MM-YYYY")
        //     : null,
        //   meeting_date: moment(data?.meeting_date).format("DD-MM-YYYY"),
        // });

        // sendEmail({
        //   email: assignByData?.email,
        //   subject: returnMessage("emailTemplate", "meetingAlert"),
        //   message: activity_email_template,
        // });
        // if (assignByData?.email !== assignToData?.email) {
        //   sendEmail({
        //     email: assignToData?.email,
        //     subject: returnMessage("emailTemplate", "meetingAlert"),
        //     message: activity_email_template,
        //   });
        // }
      });
    } catch (error) {
      logger.error(`Error while Overdue crone Job PDF, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  leaderboard = async (payload, user) => {
    try {
      let start_date, end_date;
      if (payload?.filter === "weekly") {
        start_date = moment.utc().startOf("week");
        end_date = moment.utc().endOf("week");
      } else if (payload?.filter === "monthly") {
        start_date = moment.utc().startOf("month");
        end_date = moment.utc().endOf("month");
      }
      let agency_id;
      if (user?.role?.name === "agency") {
        agency_id = user?.reference_id;
      }
      if (user?.role?.name === "team_agency") {
        const team_agency = await Team_Agency.findById(
          user?.reference_id
        ).lean();
        agency_id = team_agency?.agency_id;
      }

      const aggragate = [
        {
          $match: {
            agency_id,
            role: { $ne: "agency" },
            $or: [{ type: "task" }, { type: "login" }],
            $and: [
              { createdAt: { $gte: new Date(start_date) } },
              { createdAt: { $lte: new Date(end_date) } },
            ],
          },
        },
        {
          $group: {
            _id: "$user_id",
            totalPoints: {
              $sum: {
                $toInt: "$point",
              },
            },
          },
        },
        {
          $sort: { totalPoints: -1 },
        },
        {
          $limit: 5,
        },
        {
          $lookup: {
            from: "authentications",
            localField: "_id",
            foreignField: "reference_id",
            as: "user",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
        },
      ];
      return await Competition_Point.aggregate(aggragate);
    } catch (error) {
      logger.error(`Error while fetching the leaderboard users: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to check the activities are assigned to the attandees or not
  checkAnyActivitiesAssingend = async (payload, user) => {
    try {
      if (payload?.attendees?.length === 0) {
        return { activity_assinged_to_attendees: false };
      }

      if (user?.role?.name === "client" || user?.role?.name === "team_client")
        return throwError(
          returnMessage("auth", "unAuthorized"),
          statusCode.forbidden
        );

      validateRequestFields(payload, [
        "meeting_date",
        "activity_type",
        "meeting_start_time",
        "meeting_end_time",
      ]);

      const {
        client_id,
        meeting_date,
        meeting_start_time,
        meeting_end_time,
        activity_type,
        attendees,
      } = payload;

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(meeting_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${meeting_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${meeting_date}-${meeting_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("activity", "dateinvalid"));

      if (!end_time.isAfter(start_time))
        return throwError(returnMessage("activity", "invalidTime"));

      // if (activity_type === "others" && !payload?.recurring_end_date)
      //   return throwError(returnMessage("activity", "recurringDateRequired"));

      if (activity_type === "others" && payload?.recurring_end_date) {
        recurring_date = moment
          .utc(payload?.recurring_end_date, "DD-MM-YYYY")
          .startOf("day");
        if (!recurring_date.isSameOrAfter(start_date))
          return throwError(returnMessage("activity", "invalidRecurringDate"));
      }

      const [activity_type_id, activity_status_type] = await Promise.all([
        ActivityType.findOne({ name: activity_type }).select("_id").lean(),
        ActivityStatus.findOne({ name: "pending" }).select("name").lean(),
      ]);

      if (!activity_type_id)
        return throwError(
          returnMessage("activity", "activityTypeNotFound"),
          statusCode.notFound
        );

      // this condition is used for the check if client or team member is assined to any same time activity or not
      const or_condition = [
        {
          $and: [
            { meeting_start_time: { $gte: start_time } },
            { meeting_end_time: { $lte: end_time } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $lte: start_time } },
            { meeting_end_time: { $gte: end_time } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $gte: start_time } },
            { meeting_end_time: { $lte: end_time } },
            { meeting_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $lte: start_time } },
            { meeting_end_time: { $gte: end_time } },
            { meeting_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
      ];

      // check for the user role. if the role is team_agency then we need to
      // find the agency id for that user which he is assigned

      // let team_agency_detail;
      if (user?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          user?.reference_id
        ).lean();
        user.agency_id = team_agency_detail?.agency_id;
      }

      // if we need to check when we are updating then at that time we need the activity id
      let activity_id = {};
      if (payload?.activity_id) {
        activity_id = { _id: { $ne: payload?.activity_id } };
      }

      // this below function is used to check weather client is assign to any type of the call or other
      // activity or not if yes then throw an error but it should be in the same agency id not in the other
      let meeting_exist;
      if (user?.role?.name === "agency") {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.reference_id,
          activity_status: { $eq: activity_status_type?._id },
          activity_type: activity_type_id?._id,
          $or: or_condition,
          attendees: { $in: attendees },
          ...activity_id,
        }).lean();
      } else if (user?.role?.name === "team_agency") {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.agency_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
          attendees: { $in: attendees },
          ...activity_id,
        }).lean();
      }
      if (meeting_exist) return { activity_assinged_to_attendees: true };

      return { activity_assinged_to_attendees: false };
    } catch (error) {
      logger.error(`Error while check activity assigned or not: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // below function is used for the get the completion points for the agency and agency team member
  completionHistory = async (payload, user) => {
    try {
      const pagination = paginationObject(payload);
      const match_obj = {
        workspace_id: user?.workspace_detail?._id,
        user_id: user?._id,
      };

      const search_obj = {};
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          {
            "user.first_name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            "user.last_name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "user.name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            point: {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            type: { $regex: payload?.search.toLowerCase(), $options: "i" },
          },
        ];
      }

      const aggragate = [
        { $match: match_obj },
        {
          $lookup: {
            from: "authentications",
            localField: "user_id",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  name: { $concat: ["$first_name", " ", "$last_name"] },
                },
              },
            ],
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $match: search_obj },
      ];

      const [points_history, total_points_history] = await Promise.all([
        Gamification.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Gamification.aggregate(aggragate),
      ]);

      return {
        points_history,
        page_count: Math.ceil(
          total_points_history.length / pagination.result_per_page
        ),
      };
    } catch (error) {
      logger.error(`Error while fetching completion history: ${error}`);

      return throwError(error?.message, error?.statusCode);
    }
  };

  // competition  points statistics for the agency and agency team member
  competitionStats = async (user) => {
    try {
      const match_condition = {
        user_id: user?._id,
        workspace_id: user?.workspace,
      };

      const member_details = user?.workspace_detail?.members?.find(
        (member) =>
          member?.user_id?.toString() === user?._id?.toString() &&
          member?.status == "confirmed"
      );

      if (!member_details) return { available_points: 0, earned_points: 0 };

      const gamification = await Gamification.aggregate([
        { $match: match_condition },
        {
          $group: {
            _id: "$user_id",
            totalPoints: {
              $sum: {
                $toInt: "$point",
              },
            },
          },
        },
      ]);

      return {
        available_points: member_details?.gamification_points || 0,
        earned_points: gamification?.totalPoints || 0,
      };
    } catch (error) {
      logger.error(`Error while fetching the competition stats: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // createCallGoogleMeeting = async (payload) => {
  //   try {
  //     const {
  //       token,
  //       meeting_date,
  //       meeting_start_time,
  //       summary,
  //       location,
  //       description,
  //     } = payload;
  //     const result = await Meeting({
  //       client_id: process.env.CLIENT_ID,
  //       client_secret: process.env.CLIENT_SECRET,
  //       token,
  //       meeting_date,
  //       meeting_start_time,
  //       summary,
  //       location,
  //       description,
  //     });

  //     if (result === null) {
  //       return throwError(
  //         returnMessage("activity", "callMeetingAlreadyExists")
  //       );
  //     }
  //     return { meeting_link: result };
  //   } catch (error) {
  //     logger.error(`Error while creating google meeting : ${error}`);
  //     return throwError(error?.message, error?.statusCode);
  //   }
  // };
  createCallGoogleMeeting = async (payload) => {
    try {
      const {
        token,
        meeting_date,
        meeting_start_time,
        title,
        internal_info,
        agenda,
      } = payload;

      payload.meeting_date = moment(meeting_date, "DD-MM-YYYY").format(
        "YYYY-MM-DD"
      );

      let attendees = [];
      if (payload?.attendees && payload?.attendees[0]) {
        const attendee = await Authentication.findById();
      }

      const options = {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refreshToken: token,
        date: payload.meeting_date,
        time: meeting_start_time,
        summary: title,
        location: internal_info,
        description: agenda,
        attendees: [
          { email: "gusaibhavin88@gmail.com" },
          { email: "smitvtridhyatech@gmail.com" },
        ],
      };

      // Reference  the Npm package https://www.npmjs.com/package/google-cal-meet-api
      const { OAuth2 } = google.auth;
      const SCOPES = ["https://www.googleapis.com/auth/calendar"];

      //upper part for api access

      var date1 =
        options.date + "T" + options.time.split(":")[0] + ":00" + ":30";
      var date2 =
        options.date + "T" + options.time.split(":")[0] + ":45" + ":30";

      var x = new Date(
        options.date + "T" + options.time.split(":")[0] + ":00" + ":30"
      );
      var y = new Date(
        options.date + "T" + options.time.split(":")[0] + ":45" + ":30"
      );

      var end1 =
        options.date +
        "T" +
        x.getUTCHours() +
        ":" +
        x.getUTCMinutes() +
        ":00" +
        ".000Z";
      var end2 =
        options.date +
        "T" +
        y.getUTCHours() +
        ":" +
        y.getUTCMinutes() +
        ":00" +
        ".000Z";

      //setting details for teacher
      let oAuth2Client = new OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET
      );

      oAuth2Client.setCredentials({
        refresh_token: options.refreshToken,
      });

      // Create a new calender instance.
      let calendar = google.calendar({ version: "v3", auth: oAuth2Client });

      // Create a new event start date instance for teacher in their calendar.
      const eventStartTime = new Date();
      eventStartTime.setDate(options.date.split("-")[2]);
      const eventEndTime = new Date();
      eventEndTime.setDate(options.date.split("-")[2]);
      eventEndTime.setMinutes(eventStartTime.getMinutes() + 45);

      // Create a dummy event for temp users in our calendar
      const event = {
        summary: options.summary,
        location: options.location,
        description: options.description,
        colorId: 1,
        conferenceData: {
          createRequest: {
            requestId: "zzz",
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
        start: {
          dateTime: date1,
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: date2,
          timeZone: "Asia/Kolkata",
        },
        attendees: options.attendees,
      };

      let link = await calendar.events.insert({
        calendarId: "primary",
        conferenceDataVersion: "1",
        resource: event,
      });
      return {
        meet_link: link.data.hangoutLink,
        event_id: link.data.id, // Include eventId in the response
      };
    } catch (error) {
      logger.error(`Error while creating google meeting : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  googleMeetGenerator = async (options) => {
    try {
      // Reference  the Npm package https://www.npmjs.com/package/google-cal-meet-api
      const { google } = require("googleapis");
      const { OAuth2 } = google.auth;
      const SCOPES = ["https://www.googleapis.com/auth/calendar"];

      //upper part for api access

      var date1 =
        options.date + "T" + options.time.split(":")[0] + ":00" + ":30";
      var date2 =
        options.date + "T" + options.time.split(":")[0] + ":45" + ":30";

      var x = new Date(
        options.date + "T" + options.time.split(":")[0] + ":00" + ":30"
      );
      var y = new Date(
        options.date + "T" + options.time.split(":")[0] + ":45" + ":30"
      );

      var end1 =
        options.date +
        "T" +
        x.getUTCHours() +
        ":" +
        x.getUTCMinutes() +
        ":00" +
        ".000Z";
      var end2 =
        options.date +
        "T" +
        y.getUTCHours() +
        ":" +
        y.getUTCMinutes() +
        ":00" +
        ".000Z";

      //setting details for teacher
      let oAuth2Client = new OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET
      );

      oAuth2Client.setCredentials({
        refresh_token: options.refreshToken,
      });

      // Create a new calender instance.
      let calendar = google.calendar({ version: "v3", auth: oAuth2Client });

      // Create a new event start date instance for teacher in their calendar.
      const eventStartTime = new Date();
      eventStartTime.setDate(options.date.split("-")[2]);
      const eventEndTime = new Date();
      eventEndTime.setDate(options.date.split("-")[2]);
      eventEndTime.setMinutes(eventStartTime.getMinutes() + 45);

      // Create a dummy event for temp users in our calendar
      const event = {
        summary: options.summary,
        location: options.location,
        description: options.description,
        colorId: 1,
        conferenceData: {
          createRequest: {
            requestId: "zzz",
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
        start: {
          dateTime: date1,
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: date2,
          timeZone: "Asia/Kolkata",
        },
        attendees: options.attendees,
      };

      let link = await calendar.events.insert({
        calendarId: "primary",
        conferenceDataVersion: "1",
        resource: event,
      });
      return link.data.hangoutLink;
    } catch (error) {
      logger.error(`Error while generating the Google Meet Link: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  deleteGoogleMeeting = async (payload) => {
    try {
      const { token, eventId } = payload;

      const options = {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refreshToken: token,
      };

      // Setting up OAuth2 client
      const { OAuth2 } = google.auth;
      const oAuth2Client = new OAuth2(options.client_id, options.client_secret);

      oAuth2Client.setCredentials({
        refresh_token: options.refreshToken,
      });

      // Create a new calendar instance.
      const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

      // Delete the event
      await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
      });

      return { message: "Meeting deleted successfully" };
    } catch (error) {
      console.error(`Error while deleting Google meeting: ${error}`);
      throw new Error(error?.message || "Error deleting meeting");
    }
  };

  updateGoogleMeeting = async (payload) => {
    try {
      const {
        token,
        event_id,
        meeting_date,
        meeting_start_time,
        summary,
        location,
        description,
        recurrence,
        notifications,
        recurrence_end_date,
      } = payload;

      const options = {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        refreshToken: token,
        date: meeting_date,
        time: meeting_start_time,
        summary,
        location,
        description,
        attendees: [
          { email: "gusaibhavin88@gmail.com" },
          { email: "smitvtridhyatech@gmail.com" },
        ],
      };

      const { OAuth2 } = google.auth;
      const SCOPES = ["https://www.googleapis.com/auth/calendar"];

      // Initialize OAuth2 client
      let oAuth2Client = new OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET
      );

      oAuth2Client.setCredentials({
        refresh_token: options.refreshToken,
      });

      // Create a new calendar instance
      let calendar = google.calendar({ version: "v3", auth: oAuth2Client });

      // Calculate start and end times for the event
      var date1 =
        options.date + "T" + options.time.split(":")[0] + ":00" + ":30";
      var date2 =
        options.date + "T" + options.time.split(":")[0] + ":45" + ":30";

      var x = new Date(date1);
      var y = new Date(date2);

      var end1 =
        options.date +
        "T" +
        x.getUTCHours() +
        ":" +
        x.getUTCMinutes() +
        ":00" +
        ".000Z";
      var end2 =
        options.date +
        "T" +
        y.getUTCHours() +
        ":" +
        y.getUTCMinutes() +
        ":00" +
        ".000Z";

      // Create an event object with updated details
      const event = {
        summary: options.summary,
        location: options.location,
        description: options.description,
        colorId: 1,
        conferenceData: {
          createRequest: {
            requestId: "zzz",
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
        start: {
          dateTime: date1,
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: date2,
          timeZone: "Asia/Kolkata",
        },
        attendees: options.attendees,
      };

      // Update the event in Google Calendar
      let link = await calendar.events.update({
        calendarId: "primary",
        eventId: event_id,
        conferenceDataVersion: "1",
        resource: event,
      });

      return {
        meeting_link: link.data.hangoutLink,
        event_id: link.data.id,
      };
    } catch (error) {
      console.error(`Error while updating google meeting: ${error}`);
      throw new Error(
        error?.message || "An error occurred while updating the meeting"
      );
    }
  };
  ccGoogleMeeting = async (payload) => {
    try {
      const { code } = payload;
      const response = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id:
            "1002923374237-kg6vobgh44lqosct25ggeovq8m9g2mlu.apps.googleusercontent.com",
          client_secret: "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",
          redirect_uri: "http://localhost:3000/auth/callback",
          grant_type: "authorization_code",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const tokens = response.data;
      // Send the tokens back to the frontend, or store them securely and create a session
      res.json(tokens);
    } catch (error) {
      console.error(`Error while updating google meeting: ${error}`);
      throw new Error(
        error?.message || "An error occurred while updating the meeting"
      );
    }
  };
}

module.exports = ActivityService;
