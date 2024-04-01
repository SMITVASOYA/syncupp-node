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
  getRandomColor,
  capitalizeFirstLetter,
} = require("../utils/utils");
const ical = require("ical-generator");
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
const Client = require("../models/clientSchema");
const ics = require("ics");
const fs = require("fs");
// import { createEvent } from "ics";
const { ObjectId } = require("mongodb");
const Activity_Type_Master = require("../models/masters/activityTypeMasterSchema");
const momentTimezone = require("moment-timezone");

class ActivityService {
  createTask = async (payload, user, files) => {
    try {
      const {
        title,
        agenda,
        due_date,
        assign_to,
        client_id,
        mark_as_done,
        tags,
      } = payload;

      const attachments = [];
      if (files && files.length > 0) {
        files.forEach((file) => {
          attachments.push("uploads/" + file.filename);
        });
      }
      let agency_id;
      if (user.role.name === "agency") {
        agency_id = user?.reference_id;
      } else if (user.role.name === "team_agency") {
        const agencies = await Team_Agency.findById(user?.reference_id).lean();
        agency_id = agencies.agency_id;
      }
      const dueDateObject = moment(due_date);
      const duetimeObject = moment(due_date);

      const timeOnly = duetimeObject.format("HH:mm:ss");

      const currentDate = moment().startOf("day");

      if (!dueDateObject.isSameOrAfter(currentDate)) {
        return throwError(returnMessage("activity", "dateinvalid"));
      }
      let status;
      if (mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }

      const type = await ActivityType.findOne({ name: "task" }).lean();
      let newTags = [];
      if (tags && typeof tags !== "string") {
        tags?.forEach((item) =>
          newTags.push({
            name: capitalizeFirstLetter(item),
            color: getRandomColor(),
          })
        );
      } else {
        tags &&
          newTags.push({
            name: capitalizeFirstLetter(tags),
            color: getRandomColor(),
          });
      }

      const newTask = new Activity({
        title,
        agenda,
        due_date: dueDateObject.toDate(),
        due_time: timeOnly,
        assign_to,
        assign_by: user.reference_id,
        client_id,
        activity_status: status._id,
        activity_type: type._id,
        agency_id,
        tags: newTags,
        attachments: attachments,
      });
      const added_task = await newTask.save();

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: "$team_Data",
        },
        {
          $match: {
            _id: new mongoose.Types.ObjectId(added_task._id),
            is_deleted: false,
          },
        },
        {
          $project: {
            agenda: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_Data.email",
            agency_id: 1,
          },
        },
      ];

      const client_data = await Authentication.findOne({
        reference_id: client_id,
      }).lean();
      if (user.role.name === "agency") {
        // ----------------------- Notification Start -----------------------
        const indianTimeZone = dueDateObject.tz("Asia/Kolkata").format("HH:mm");

        const getTask = await Activity.aggregate(pipeline);
        let data = {
          TaskTitle: "New Task Created",
          taskName: title,
          status: status?.name,
          assign_by: user.first_name + " " + user.last_name,
          dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
          dueTime: indianTimeZone,
          agginTo_email: getTask[0]?.assign_email,
          assignName: getTask[0]?.assigned_to_name,
        };
        const taskMessage = taskTemplate(data);
        sendEmail({
          email: getTask[0]?.assign_email,
          subject: returnMessage("activity", "createSubject"),
          message: taskMessage,
        });

        if (client_data) {
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("activity", "createSubject"),
            message: taskTemplate({
              ...data,
              assignName: client_data.first_name + " " + client_data.last_name,
            }),
          });
        }

        await notificationService.addNotification(
          {
            assign_by: user?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              getTask[0]?.assigned_to_first_name +
              " " +
              getTask[0]?.assigned_to_last_name,
            ...payload,
            module_name: "task",
            activity_type_action: "createTask",
            activity_type: "task",
            due_time: moment(due_date).format("HH:mm"),
            due_date: moment(due_date).format("DD-MM-YYYY"),
          },
          getTask[0]?._id
        );

        // ----------------------- Notification END -----------------------
      }

      if (
        user.role.name === "team_agency" ||
        user.role.name === "team_client"
      ) {
        // ----------------------- Notification Start -----------------------

        const indianTimeZone = dueDateObject.tz("Asia/Kolkata").format("HH:mm");

        const getTask = await Activity.aggregate(pipeline);
        let data = {
          TaskTitle: "New Task Created",
          taskName: title,
          status: status?.name,
          assign_by: user.first_name + " " + user.last_name,
          dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
          dueTime: indianTimeZone,
          agginTo_email: getTask[0]?.assign_email,
          assignName: getTask[0]?.assigned_to_name,
        };
        const taskMessage = taskTemplate(data);
        sendEmail({
          email: getTask[0]?.assign_email,
          subject: returnMessage("activity", "createSubject"),
          message: taskMessage,
        });

        if (client_data) {
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("activity", "createSubject"),

            message: taskTemplate({
              ...data,
              assignName: client_data.first_name + " " + client_data.last_name,
            }),
          });
        }

        const agencyData = await Authentication.findOne({
          reference_id: getTask[0]?.agency_id,
        });

        await notificationService.addNotification(
          {
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            agency_id: agencyData?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              getTask[0]?.assigned_to_first_name +
              " " +
              getTask[0]?.assigned_to_last_name,
            ...payload,
            module_name: "task",
            activity_type_action: "createTask",
            activity_type: "task",
            due_time: moment(due_date).format("HH:mm"),
            due_date: moment(due_date).format("DD-MM-YYYY"),
            log_user: "member",
          },
          getTask[0]?._id
        );
        // ----------------------- Notification END -----------------------
      }

      return added_task;
    } catch (error) {
      logger.error(`Error while creating task : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  activityStatus = async () => {
    try {
      return await ActivityStatus.find();
    } catch (error) {
      logger.error(`Error while fetch list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  taskList = async (searchObj, user) => {
    if (!searchObj.pagination)
      return await this.taskListWithOutPaination(searchObj, user);

    try {
      let queryObj;
      if (user?.role?.name === "agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();

        queryObj = {
          is_deleted: false,
          agency_id: user.reference_id,
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "team_agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");
        if (teamRole?.role?.name === "admin") {
          queryObj = {
            $or: [
              { assign_by: user.reference_id },
              { assign_to: user.reference_id },
            ],
            is_deleted: false,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        } else if (teamRole.role.name === "team_member") {
          queryObj = {
            is_deleted: false,
            assign_to: user.reference_id,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      }
      const pagination = paginationObject(searchObj);
      const filter = {
        $match: {},
      };
      if (searchObj?.filter) {
        if (searchObj?.filter?.status === "in_progress") {
          const activity_status = await ActivityStatus.findOne({
            name: "in_progress",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "pending") {
          const activity_status = await ActivityStatus.findOne({
            name: "pending",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "overdue") {
          const activity_status = await ActivityStatus.findOne({
            name: "overdue",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "done") {
          const activity_status = await ActivityStatus.findOne({
            name: "completed",
          })
            .select("_id name")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "cancel") {
          const activity_status = await ActivityStatus.findOne({
            name: "cancel",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }

        if (searchObj?.filter?.client_id) {
          // const client_detail = await Client.findById(client_id);
          filter["$match"] = {
            ...filter["$match"],
            client_id: new mongoose.Types.ObjectId(
              searchObj?.filter?.client_id
            ),
          };
        }
        if (searchObj?.filter?.assign_to) {
          filter["$match"] = {
            ...filter["$match"],
            assign_to: new mongoose.Types.ObjectId(
              searchObj?.filter?.assign_to
            ),
          };
        }
        if (searchObj?.filter?.tag) {
          const tagRegex = new RegExp(searchObj.filter.tag.toLowerCase(), "i"); // 'i' flag for case-insensitive matching
          filter["$match"].tags = {
            $elemMatch: {
              name: tagRegex,
            },
          };
        }
      }

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            status: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "client_Data.client_name": {
              $regex: searchObj.search,
              $options: "i",
            },
          },
          {
            "team_by.first_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.first_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.last_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_by.last_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_by.assigned_by_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.assigned_to_name": {
              $regex: searchObj.search,
              $options: "i",
            },
          },
          {
            tags: {
              $elemMatch: {
                name: {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
            },
          },

          // {
          //   assigned_by_name: {
          //     $regex: searchObj.search,
          //     $options: "i",
          //   },
          // },
        ];
        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "number") {
          const numericKeyword = parseInt(searchObj.search);

          queryObj["$or"].push({
            revenue_made: numericKeyword,
          });
        } else if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
          queryObj["$or"].push({ updatedAt: dateKeyword });
        }
      }

      const taskPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "reference_id",
            as: "client_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  client_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$client_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  _id: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$team_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "team_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$team_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { name: 1, _id: 1 } }],
          },
        },
        {
          $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
        },
        {
          $match: queryObj,
        },
        filter,
        {
          $project: {
            contact_number: 1,
            title: 1,
            status: "$status.name",
            due_time: 1,
            assign_to: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            assign_by: 1,
            client_id: 1,
            assigned_by_first_name: "$team_by.first_name",
            assigned_by_last_name: "$team_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$team_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            tags: 1,
            agency_id: 1,
          },
        },
      ];
      const activity = await Activity.aggregate(taskPipeline)
        .sort(pagination.sort)
        .skip(pagination.skip)
        .limit(pagination.result_per_page);

      const totalAgreementsCount = await Activity.aggregate(taskPipeline);

      // Calculating total pages
      const pages = Math.ceil(
        totalAgreementsCount.length / pagination.result_per_page
      );

      return {
        activity,
        page_count: pages,
      };
    } catch (error) {
      logger.error(`Error while fetch list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  taskListWithOutPaination = async (searchObj, user) => {
    try {
      let queryObj;
      if (user?.role?.name === "agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();

        queryObj = {
          is_deleted: false,
          agency_id: user.reference_id,
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "team_agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");
        if (teamRole?.role?.name === "admin") {
          queryObj = {
            $or: [
              { assign_by: user.reference_id },
              { assign_to: user.reference_id },
            ],
            is_deleted: false,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        } else if (teamRole.role.name === "team_member") {
          queryObj = {
            is_deleted: false,
            assign_to: user.reference_id,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          activity_type: new mongoose.Types.ObjectId(type._id),
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
        };
      }
      const filter = {
        $match: {},
      };
      if (searchObj?.filter) {
        if (searchObj?.filter?.status === "in_progress") {
          const activity_status = await ActivityStatus.findOne({
            name: "in_progress",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "pending") {
          const activity_status = await ActivityStatus.findOne({
            name: "pending",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "overdue") {
          const activity_status = await ActivityStatus.findOne({
            name: "overdue",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "done") {
          const activity_status = await ActivityStatus.findOne({
            name: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        } else if (searchObj?.filter?.status === "cancel") {
          const activity_status = await ActivityStatus.findOne({
            name: "cancel",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }

        if (searchObj?.filter?.client_id) {
          // const client_detail = await Client.findById(client_id);
          filter["$match"] = {
            ...filter["$match"],
            client_id: new mongoose.Types.ObjectId(
              searchObj?.filter?.client_id
            ),
          };
        }
        if (searchObj?.filter?.assign_to) {
          filter["$match"] = {
            ...filter["$match"],
            assign_to: new mongoose.Types.ObjectId(
              searchObj?.filter?.assign_to
            ),
          };
        }
        if (searchObj?.filter?.tag) {
          const tagRegex = new RegExp(searchObj.filter.tag.toLowerCase(), "i"); // 'i' flag for case-insensitive matching
          filter["$match"].tags = {
            $elemMatch: {
              name: tagRegex,
            },
          };
        }
      }
      const pagination = paginationObject(searchObj);

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            status: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "assign_by.first_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.first_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.last_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "assign_by.last_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "assign_by.assigned_by_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_Data.assigned_to_name": {
              $regex: searchObj.search,
              $options: "i",
            },
          },
          {
            "client_Data.client_name": {
              $regex: searchObj.search,
              $options: "i",
            },
          },
          {
            tags: {
              $elemMatch: {
                $regex: searchObj.search.toLowerCase(),
                $options: "i",
              },
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "number") {
          const numericKeyword = parseInt(searchObj.search);

          queryObj["$or"].push({
            revenue_made: numericKeyword,
          });
        } else if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
          queryObj["$or"].push({ updatedAt: dateKeyword });
        }
      }
      const taskPipeline = [
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "reference_id",
            as: "client_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  client_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$client_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$team_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
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
          $match: queryObj,
        },
        {
          $project: {
            contact_number: 1,
            title: 1,
            status: "$status.name",
            due_time: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            client_id: 1,
            assign_to: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            tags: 1,
          },
        },
      ];
      const activity = await Activity.aggregate(taskPipeline).sort({
        createdAt: -1,
      });
      // .skip(pagination.skip)
      // .limit(pagination.result_per_page);

      const totalAgreementsCount = await Activity.countDocuments(queryObj);

      // Calculating total pages
      const pages = Math.ceil(
        totalAgreementsCount / pagination.result_per_page
      );

      return {
        activity,
        // page_count: pages,
      };
    } catch (error) {
      logger.error(`Error while fetch list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getTaskById = async (id) => {
    try {
      const taskPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "reference_id",
            as: "client_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$client_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$team_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "attendees",
            foreignField: "reference_id",
            as: "attendeesData",
            pipeline: [
              {
                $project: {
                  email: 1,
                  reference_id: 1,
                  _id: 0,
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
          $lookup: {
            from: "activity_type_masters",
            localField: "activity_type",
            foreignField: "_id",
            as: "activity_type",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$activity_type", preserveNullAndEmptyArrays: true },
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
            due_date: 1,
            createdAt: 1,
            status: "$status.name",
            client_id: 1,
            client_name: "$client_Data.name",
            client_first_name: "$client_Data.first_name",
            client_last_name: "$client_Data.last_name",
            agenda: 1,
            client_fullName: {
              $concat: [
                "$client_Data.first_name",
                " ",
                "$client_Data.last_name",
              ],
            },
            assign_to: 1,
            assigned_to_name: "$team_Data.name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_by_name: "$assign_by.name",
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: {
              $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
            },
            assigned_to_name: {
              $concat: ["$team_Data.first_name", " ", "$team_Data.last_name"],
            },
            meeting_start_time: 1,
            meeting_end_time: 1,
            recurring_end_date: 1,
            activity_type: 1,
            attendees: "$attendeesData",
            attachments: 1,
            tags: 1,
            internal_info: 1,
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

  deleteTask = async (payload) => {
    const { taskIdsToDelete } = payload;
    try {
      await Activity.updateMany(
        { _id: { $in: taskIdsToDelete } },
        { $set: { is_deleted: true } }
      );

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: "$team_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: "$assign_by",
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
          $unwind: "$status",
        },
        {
          $match: {
            _id: {
              $in: taskIdsToDelete.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
        },
        {
          $project: {
            agenda: 1,
            status: "$status.name",
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_Data.email",
            due_date: 1,
            due_time: 1,
            title: 1,
            assign_to: 1,
            client_id: 1,
          },
        },
      ];
      const getTask = await Activity.aggregate(pipeline);
      getTask.forEach(async (task) => {
        let data = {
          TaskTitle: "Deleted Task",
          taskName: task?.title,
          status: task?.status,
          assign_by: task?.assigned_by_name,
          dueDate: moment(task?.due_date)?.format("DD/MM/YYYY"),
          dueTime: task?.due_time,
          agginTo_email: task?.assign_email,
          assignName: task?.assigned_to_name,
        };
        const taskMessage = taskTemplate(data);
        const clientData = await Authentication.findOne({
          reference_id: task?.client_id,
        }).lean();
        await sendEmail({
          email: task?.assign_email,
          subject: returnMessage("activity", "taskDeleted"),
          message: taskMessage,
        });

        if (clientData) {
          await sendEmail({
            email: clientData?.email,
            subject: returnMessage("activity", "taskDeleted"),
            message: taskTemplate({
              ...data,
              assignName: clientData.first_name + " " + clientData.last_name,
            }),
          });
        }

        await notificationService.addNotification(
          {
            title: task?.title,
            module_name: "task",
            activity_type_action: "deleted",
            activity_type: "task",
            assign_to: task?.assign_to,
            client_id: task?.client_id,
          },
          task?._id
        );
        return;
      });

      return;
    } catch (error) {
      logger.error(`Error while Deleting task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  updateTask = async (payload, id, files, logInUser) => {
    try {
      const {
        title,
        agenda,
        due_date,
        assign_to,
        client_id,
        mark_as_done,
        tags,
      } = payload;

      const attachments = [];
      if (files && files.length > 0) {
        files.forEach((file) => {
          attachments.push("uploads/" + file.filename);
        });
        const existingFiles = await Activity.findById(id);

        existingFiles &&
          existingFiles?.attachments.map((item) => {
            fs.unlink(`./src/public/${item}`, (err) => {
              if (err) {
                logger.error(`Error while unlinking the documents: ${err}`);
              }
            });
          });
      }
      const status_check = await Activity.findById(id).populate(
        "activity_status"
      );
      if (status_check?.activity_status?.name === "completed") {
        return throwError(returnMessage("activity", "CannotUpdate"));
      }
      const dueDateObject = moment(due_date);
      const duetimeObject = moment(due_date);

      let updatedData = await Activity.findById(id).lean();
      const timeOnly = duetimeObject.format("HH:mm:ss");

      const currentDate = moment().startOf("day");
      let check_due_date = moment(updatedData.due_date);
      if (!check_due_date.isSame(dueDateObject)) {
        if (!dueDateObject.isSameOrAfter(currentDate)) {
          return throwError(returnMessage("activity", "dateinvalid"));
        }
      }
      let status;
      if (mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      }

      let newTags = [];

      if (tags && typeof tags !== "string") {
        tags?.forEach((item) =>
          newTags.push({
            name: capitalizeFirstLetter(item),
            color: getRandomColor(),
          })
        );
      } else {
        tags &&
          newTags.push({
            name: capitalizeFirstLetter(tags),
            color: getRandomColor(),
          });
      }

      const current_activity = await Activity.findById(id).lean();
      let updateTasksPayload = {
        title,
        agenda,
        due_date: dueDateObject.toDate(),
        due_time: timeOnly,
        assign_to,
        activity_status: status?._id,
        ...(newTags[0] && { tags: newTags }),
        ...(typeof tags !== "string" && { tags: newTags }),
        ...(!tags && { tags: [] }),
        ...(attachments.length > 0 && { attachments }),
      };

      // Check if client_id is null, exclude it from the update payload
      if (!client_id) {
        updateTasksPayload.client_id = null;
      } else {
        updateTasksPayload.client_id = client_id;
      }

      const updateTasks = await Activity.findByIdAndUpdate(
        id,
        updateTasksPayload,
        { new: true, useFindAndModify: false }
      );
      // const updateTasks = await Activity.findByIdAndUpdate(
      //   id,
      //   {
      //     title,
      //     agenda,
      //     due_date: dueDateObject.toDate(),
      //     due_time: timeOnly,
      //     assign_to,
      //     client_id,
      //     activity_status: status?._id,
      //     ...(newTags[0] && { tags: newTags }),
      //     ...(typeof tags !== "string" && { tags: newTags }),
      //     ...(!tags && { tags: [] }),

      //     ...(attachments.length > 0 && { attachments }),
      //   },
      //   { new: true, useFindAndModify: false }
      // );
      const current_status = current_activity?.activity_status;

      if (current_status?.toString() !== status?._id.toString()) {
        const referral_data = await Configuration.findOne().lean();

        if (
          current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "completed" }).lean()
            )?._id?.toString() &&
          (status?.name === "pending" ||
            status?.name === "in_progress" ||
            status?.name === "overdue")
        ) {
          await Activity.findOneAndUpdate(
            { _id: id },
            {
              $inc: {
                competition_point:
                  -referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );

          const userData = await Authentication.findOne({
            reference_id: current_activity.assign_to,
          }).populate("role");

          if (userData.role.name === "agency") {
            await Agency.findOneAndUpdate(
              { _id: current_activity.assign_to },
              {
                $inc: {
                  total_referral_point:
                    -referral_data?.competition?.successful_task_competition,
                },
              },
              { new: true }
            );
          }

          if (userData.role.name === "team_agency") {
            await Team_Agency.findOneAndUpdate(
              { _id: current_activity.assign_to },
              {
                $inc: {
                  total_referral_point:
                    -referral_data?.competition?.successful_task_competition,
                },
              },
              { new: true }
            );
          }

          const assign_role = await Authentication.findOne({
            reference_id: current_activity.assign_to,
          }).populate("role", "name");

          await Competition_Point.create({
            user_id: current_activity.assign_to,
            agency_id: current_activity.agency_id,
            point:
              -referral_data.competition.successful_task_competition?.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });

          const agencyData = await Authentication.findOne({
            reference_id: current_activity.agency_id,
          });

          await notificationService.addNotification({
            module_name: "referral",
            action_type: "taskDeduct",
            task_name: current_activity?.title,
            referred_by: agencyData?.first_name + " " + agencyData?.last_name,
            receiver_id: current_activity?.agency_id,
            points:
              referral_data.competition.successful_task_competition?.toString(),
          });
        }

        if (
          (current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "pending" }).lean()
            )?._id?.toString() &&
            status?.name === "completed") ||
          (current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "overdue" }).lean()
            )?._id?.toString() &&
            status?.name === "completed") ||
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "in_progress" }).lean()
            )?._id.toString() &&
            status?.name === "completed")
        ) {
          await Activity.findOneAndUpdate(
            { _id: id },
            {
              $inc: {
                competition_point:
                  referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );

          if (userData.role.name === "agency") {
            await Agency.findOneAndUpdate(
              { _id: current_activity.assign_to },
              {
                $inc: {
                  total_referral_point:
                    referral_data?.competition?.successful_task_competition,
                },
              },
              { new: true }
            );
          }
          if (userData.role.name === "team_agency") {
            await Team_Agency.findOneAndUpdate(
              { _id: current_activity.assign_to },
              {
                $inc: {
                  total_referral_point:
                    -referral_data?.competition?.successful_task_competition,
                },
              },
              { new: true }
            );
          }

          const assign_role = await Authentication.findOne({
            reference_id: current_activity.assign_to,
          }).populate("role", "name");

          await Competition_Point.create({
            user_id: current_activity.assign_to,
            agency_id: current_activity.agency_id,
            point:
              +referral_data.competition.successful_task_competition?.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });

          const agencyData = await Authentication.findOne({
            reference_id: current_activity.agency_id,
          });

          await notificationService.addNotification({
            module_name: "referral",
            action_type: "taskAdded",
            task_name: current_activity?.title,
            referred_by: agencyData?.first_name + " " + agencyData?.last_name,
            receiver_id: current_activity?.agency_id,
            points:
              referral_data.competition.successful_task_competition?.toString(),
          });
        }
      }

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: "$team_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: "$assign_by",
        },

        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "statusName",
          },
        },
        {
          $unwind: { path: "$statusName", preserveNullAndEmptyArrays: true },
        },
        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            is_deleted: false,
          },
        },
        {
          $project: {
            agenda: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_Data.email",
            agency_id: 1,
            status_name: "$statusName.name",
          },
        },
      ];
      const getTask = await Activity.aggregate(pipeline);

      let data = {
        TaskTitle: "Updated Task ",
        taskName: title,
        status:
          payload?.mark_as_done === "true"
            ? "Completed"
            : getTask[0]?.status_name,
        assign_by: getTask[0]?.assigned_by_name,
        dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
        dueTime: timeOnly,
        agginTo_email: getTask[0]?.assign_email,
        assignName: getTask[0]?.assigned_to_name,
      };
      const client_data = await Authentication.findOne({
        reference_id: payload?.client_id,
      }).lean();

      const taskMessage = taskTemplate(data);
      sendEmail({
        email: getTask[0]?.assign_email,
        subject: returnMessage("activity", "UpdateSubject"),
        message: taskMessage,
      });

      if (client_data) {
        sendEmail({
          email: client_data?.email,
          subject: returnMessage("activity", "UpdateSubject"),
          message: taskTemplate({
            ...data,
            assignName: client_data.first_name + " " + client_data.last_name,
          }),
        });
      }

      if (logInUser?.role?.name === "agency") {
        // -------------- Socket notification start --------------------

        let taskAction = "update";
        // For Complete
        if (mark_as_done === "true") taskAction = "completed";
        await notificationService.addNotification(
          {
            ...payload,
            module_name: "task",
            activity_type_action: taskAction,
            activity_type: "task",
            agenda: agenda,
            title: title,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name: getTask[0]?.assigned_to_name,
            due_time: new Date(due_date).toTimeString().split(" ")[0],
            due_date: new Date(due_date).toLocaleDateString("en-GB"),
          },
          id
        );

        // -------------- Socket notification end --------------------
      } else if (logInUser?.role?.name === "team_agency") {
        // -------------- Socket notification start --------------------

        const client_data = await Authentication.findOne({
          reference_id: client_id,
        });

        const agencyData = await Authentication.findOne({
          reference_id: getTask[0]?.agency_id,
        });
        let taskAction = "update";
        // For Complete

        if (mark_as_done === "true") taskAction = "completed";
        await notificationService.addNotification(
          {
            ...payload,
            module_name: "task",
            activity_type_action: taskAction,
            activity_type: "task",
            agenda: agenda,
            title: title,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            agency_id: getTask[0]?.agency_id,
            assigned_to_name: getTask[0]?.assigned_to_name,
            due_time: new Date(due_date).toTimeString().split(" ")[0],
            due_date: new Date(due_date).toLocaleDateString("en-GB"),
            log_user: "member",
          },
          id
        );

        // -------------- Socket notification end --------------------
      }

      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating task, ${error}`);
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
      let current_activity = await Activity.findById(id).lean();
      let current_status = current_activity.activity_status;

      const updateTasks = await Activity.findByIdAndUpdate(
        {
          _id: id,
        },
        {
          activity_status: update_status._id,
        },
        { new: true, useFindAndModify: false }
      );
      const type = await ActivityType.findOne({ name: "task" }).lean();
      if (
        current_status?.toString() !== update_status?._id?.toString() &&
        current_activity?.activity_type?.toString() === type?._id?.toString()
      ) {
        const referral_data = await Configuration.findOne().lean();

        // Decrement completion points if transitioning from completed to pending, in_progress, or overdue
        if (
          current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "completed" }).lean()
            )?._id?.toString() &&
          (update_status?.name === "pending" ||
            update_status?.name === "in_progress" ||
            update_status?.name === "overdue")
        ) {
          await Activity.findOneAndUpdate(
            { _id: id },
            {
              $inc: {
                competition_point:
                  -referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );
          await Agency.findOneAndUpdate(
            { _id: current_activity.agency_id },
            {
              $inc: {
                total_referral_point:
                  -referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );
          const assign_role = await Authentication.findOne({
            reference_id: current_activity.assign_to,
          }).populate("role", "name");

          await Competition_Point.create({
            user_id: current_activity.assign_to,
            agency_id: current_activity.agency_id,
            point:
              -referral_data.competition.successful_task_competition?.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });

          const agencyData = await Authentication.findOne({
            reference_id: current_activity.agency_id,
          });

          await notificationService.addNotification({
            module_name: "referral",
            action_type: "taskDeduct",
            task_name: current_activity?.title,
            referred_by: agencyData?.first_name + " " + agencyData?.last_name,
            receiver_id: current_activity?.agency_id,
            points:
              referral_data.competition.successful_task_competition?.toString(),
          });
        }

        // Increment completion points if transitioning from pending or overdue to completed
        if (
          (current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "pending" }).lean()
            )?._id?.toString() &&
            update_status?.name === "completed") ||
          (current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "overdue" }).lean()
            )?._id?.toString() &&
            update_status?.name === "completed") ||
          (current_status?.toString() ===
            (
              await ActivityStatus.findOne({ name: "in_progress" }).lean()
            )?._id?.toString() &&
            update_status?.name === "completed")
        ) {
          await Activity.findOneAndUpdate(
            { _id: id },
            {
              $inc: {
                competition_point:
                  referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );
          await Agency.findOneAndUpdate(
            { _id: current_activity.agency_id },
            {
              $inc: {
                total_referral_point:
                  referral_data?.competition?.successful_task_competition,
              },
            },
            { new: true }
          );
          const assign_role = await Authentication.findOne({
            reference_id: current_activity.assign_to,
          }).populate("role", "name");

          await Competition_Point.create({
            user_id: current_activity.assign_to,
            agency_id: current_activity.agency_id,
            point:
              +referral_data.competition.successful_task_competition?.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });

          const agencyData = await Authentication.findOne({
            reference_id: current_activity.agency_id,
          });

          await notificationService.addNotification({
            module_name: "referral",
            action_type: "taskAdded",
            task_name: current_activity?.title,
            referred_by: agencyData?.first_name + " " + agencyData?.last_name,
            receiver_id: current_activity?.agency_id,
            points:
              referral_data.competition.successful_task_competition?.toString(),
          });
        }
      }

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$team_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "activity_type_masters",
            localField: "activity_type",
            foreignField: "_id",
            as: "activity_type",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$activity_type", preserveNullAndEmptyArrays: true },
        },
        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            is_deleted: false,
          },
        },
        {
          $project: {
            agenda: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_Data.email",
            due_date: 1,
            due_time: 1,
            title: 1,
            activity_type: "$activity_type.name",
            meeting_start_time: 1,
            meeting_end_time: 1,
            recurring_end_date: 1,
            assign_to: 1,
            assign_by: 1,
            client_id: 1,
            tags: 1,
            attendees: 1,
          },
        },
      ];

      const getTask = await Activity.aggregate(pipeline);
      const [assign_to_data, client_data, attendees_data] = await Promise.all([
        Authentication.findOne({ reference_id: getTask[0]?.assign_to }),
        Authentication.findOne({ reference_id: getTask[0]?.client_id }),
        Authentication.find({
          reference_id: { $in: getTask[0]?.attendees },
        }).lean(),
      ]);

      let task_status;
      let emailTempKey;
      if (payload.status == "cancel") {
        task_status = "cancel";
        emailTempKey = "meetingCancelled";
      }
      if (payload.status == "completed") {
        task_status = "completed";
        emailTempKey = "activityCompleted";
      }
      if (payload.status == "in_progress") {
        task_status = "inProgress";
        emailTempKey = "activityInProgress";
      }
      if (payload.status == "pending") {
        task_status = "pending";
        emailTempKey = "activityInPending";
      }
      if (payload.status == "overdue") {
        task_status = "overdue";
        emailTempKey = "activityInOverdue";
      }
      if (getTask[0].activity_type === "task") {
        let data = {
          TaskTitle: "Updated Task status",
          taskName: getTask[0]?.title,
          status: payload.status,
          assign_by: getTask[0]?.assigned_by_name,
          dueDate: moment(getTask[0]?.due_date)?.format("DD/MM/YYYY"),
          dueTime: getTask[0]?.due_time,
          agginTo_email: getTask[0]?.assign_email,
          assignName: getTask[0]?.assigned_to_name,
        };
        const taskMessage = taskTemplate(data);
        sendEmail({
          email: getTask[0]?.assign_email,
          subject: returnMessage("activity", "UpdateSubject"),
          message: taskMessage,
        });

        if (client_data) {
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("activity", "UpdateSubject"),
            message: taskTemplate({
              ...data,
              assignName: client_data.first_name + " " + client_data.last_name,
            }),
          });
        }

        if (user?.role?.name === "agency") {
          //   ----------    Notifications start ----------
          await notificationService.addNotification(
            {
              client_name: client_data
                ? client_data?.first_name + " " + client_data?.last_name
                : "",
              assigned_to_name:
                assign_to_data?.first_name + " " + assign_to_data?.last_name,
              ...getTask[0],
              module_name: "task",
              activity_type_action: task_status,
              activity_type: "task",
              meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
                "HH:mm"
              ),
              due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
            },
            id
          );
          //   ----------    Notifications end ----------
        }

        if (
          user.role.name === "team_agency" ||
          user.role.name === "team_client"
        ) {
          const agencyData = await Authentication.findById(
            getTask[0].assign_by._id
          );

          //   ----------    Notifications start ----------
          await notificationService.addNotification(
            {
              client_name: client_data
                ? client_data.first_name + " " + client_data.last_name
                : "",
              agency_name: agencyData?.first_name + " " + agencyData?.last_name,
              assigned_to_name:
                assign_to_data?.first_name + " " + assign_to_data?.last_name,
              ...getTask[0],
              module_name: "task",
              log_user: "member",
              activity_type_action: task_status,
              activity_type: "task",
              meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
                "HH:mm"
              ),
              due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
              assigned_by_name: getTask[0]?.assigned_by_name,
              assign_by: agencyData?.reference_id,
            },
            id
          );
          //   ----------    Notifications end ----------
        }
      } else {
        //   ----------    Notifications start ----------
        if (user.role.name === "agency") {
          const activity_email_template = activityTemplate({
            ...getTask[0],
            activity_type: getTask[0]?.activity_type,
            meeting_start_time: momentTimezone(
              getTask[0]?.meeting_start_time,
              "HH:mm"
            )
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            meeting_end_time: momentTimezone(
              getTask[0]?.meeting_end_time,
              "HH:mm"
            )
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            recurring_end_date: getTask[0]?.recurring_end_date
              ? moment(getTask[0]?.recurring_end_date).format("DD-MM-YYYY")
              : null,
            due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
            status: payload?.status,
            client_name: client_data
              ? client_data?.first_name + " " + client_data?.last_name
              : "",
          });
          client_data &&
            sendEmail({
              email: client_data?.email,
              subject: returnMessage("emailTemplate", emailTempKey),
              message: activity_email_template,
            });

          sendEmail({
            email: assign_to_data?.email,
            subject: returnMessage("emailTemplate", emailTempKey),
            message: activity_email_template,
          });

          attendees_data &&
            attendees_data[0] &&
            attendees_data.map((item) => {
              sendEmail({
                email: item?.email,
                subject: returnMessage("emailTemplate", emailTempKey),
                message: activity_email_template,
              });
            });

          //   ----------    Notifications start ----------

          await notificationService.addNotification(
            {
              client_name: client_data
                ? client_data?.first_name + " " + client_data?.last_name
                : "",
              assigned_to_name:
                assign_to_data?.first_name + " " + assign_to_data?.last_name,
              ...getTask[0],
              module_name: "activity",
              activity_type_action: task_status,
              activity_type:
                getTask[0]?.activity_type.name === "others"
                  ? "activity"
                  : "call meeting",
              meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
                "HH:mm"
              ),
              due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
              tags: getTask[0]?.tags,
            },
            id
          );
          //   ----------    Notifications end ----------
        }

        if (
          user.role.name === "team_agency" ||
          user.role.name === "team_client"
        ) {
          const agencyData = await Authentication.findById(
            getTask[0].assign_by._id
          );

          const activity_email_template = activityTemplate({
            ...getTask[0],
            activity_type: getTask[0]?.activity_type,
            meeting_end_time: moment(getTask[0]?.meeting_end_time).format(
              "HH:mm"
            ),
            meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
              "HH:mm"
            ),
            recurring_end_date: getTask[0]?.recurring_end_date
              ? moment(getTask[0]?.recurring_end_date).format("DD-MM-YYYY")
              : null,
            due_date: moment(getTask[0].due_date).format("DD-MM-YYYY"),
            status: payload?.status,
            client_name: client_data
              ? client_data?.first_name + " " + client_data?.last_name
              : "",
          });
          client_data &&
            sendEmail({
              email: client_data?.email,
              subject: returnMessage("emailTemplate", emailTempKey),
              message: activity_email_template,
            });
          sendEmail({
            email: assign_to_data?.email,
            subject: returnMessage("emailTemplate", emailTempKey),
            message: activity_email_template,
          });

          attendees_data &&
            attendees_data[0] &&
            attendees_data.map((item) => {
              sendEmail({
                email: item?.email,
                subject: returnMessage("emailTemplate", emailTempKey),
                message: activity_email_template,
              });
            });

          //   ----------    Notifications start ----------

          await notificationService.addNotification(
            {
              client_name: client_data
                ? client_data?.first_name + " " + client_data?.last_name
                : "",
              assigned_to_name:
                assign_to_data?.first_name + " " + assign_to_data?.last_name,
              ...getTask[0],
              module_name: "activity",
              activity_type_action: task_status,
              activity_type:
                getTask[0]?.activity_type.name === "others"
                  ? "activity"
                  : "call meeting",
              meeting_start_time: moment(getTask[0]?.meeting_start_time).format(
                "HH:mm"
              ),
              due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
              tags: getTask[0].tags,
              log_user: "member",
              assigned_by_name: getTask[0]?.assigned_by_name,
              assign_by: agencyData?.reference_id,
            },
            id
          );
          //   ----------    Notifications end ----------
        }
      }
      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating status, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to create the call meeting and other call details
  createCallMeeting = async (payload, user) => {
    try {
      if (user?.role?.name === "client" || user?.role?.name === "team_client")
        return throwError(
          returnMessage("auth", "unAuthorized"),
          statusCode.forbidden
        );

      validateRequestFields(payload, [
        "title",
        // "client_id",
        "due_date",
        "assign_to",
        "activity_type",
        "meeting_start_time",
        "meeting_end_time",
      ]);

      const {
        client_id,
        assign_to,
        title,
        agenda,
        due_date,
        meeting_start_time,
        meeting_end_time,
        activity_type,
        internal_info,
        mark_as_done,
        attendees,
      } = payload;

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${due_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${due_date}-${meeting_end_time}`,
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
        ActivityType.findOne({
          name: activity_type,
        })
          .select("_id")
          .lean(),
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
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $lte: start_time } },
            { meeting_end_time: { $gte: end_time } },
            { due_date: { $gte: start_date } },
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

      // this below function is used to check weather client is assign to any type of the call or other
      // activity or not if yes then throw an error but it should be in the same agency id not in the other
      let meeting_exist;
      if (user?.role?.name === "agency" && !mark_as_done) {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.reference_id,
          activity_status: { $eq: activity_status_type?._id },
          activity_type: activity_type_id?._id,
          $or: or_condition,
        }).lean();
      } else if (user?.role?.name === "team_agency" && !mark_as_done) {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.agency_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        }).lean();
      }
      if (meeting_exist)
        return throwError(
          returnMessage("activity", "meetingScheduledForClient")
        );

      // if the user role is agency then we need to check weather team member is assined to other call or not

      if (user?.role?.name === "agency" && !mark_as_done) {
        const meeting_exist = await Activity.findOne({
          assign_to,
          agency_id: user?.reference_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        }).lean();

        if (meeting_exist)
          return throwError(
            returnMessage("activity", "meetingScheduledForTeam")
          );
      } else if (user?.role?.name === "team_agency" && !mark_as_done) {
        const meeting_exist = await Activity.findOne({
          assign_to,
          agency_id: user?.agency_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        }).lean();

        if (meeting_exist)
          return throwError(
            returnMessage("activity", "meetingScheduledForTeam")
          );
      }

      let status;
      if (mark_as_done && mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }
      const newActivity = await Activity.create({
        activity_status: status?._id,
        activity_type: activity_type_id?._id,
        agency_id: user?.agency_id || user?.reference_id,
        assign_by: user?.reference_id,
        agenda,
        assign_to,
        title,
        client_id,
        internal_info,
        meeting_start_time: start_time,
        meeting_end_time: end_time,
        due_date: start_date,
        recurring_end_date: recurring_date,
        attendees: attendees,
      });

      const event = {
        start: [
          moment(start_date).year(),
          moment(start_date).month() + 1, // Months are zero-based in JavaScript Date objects
          moment(start_date).date(),
          moment(payload.meeting_start_time, "HH:mm").hour(), // Use .hour() to get the hour as a number
          moment(payload.meeting_start_time, "HH:mm").minute(),
        ],
        end: [
          moment(recurring_date).year(),
          moment(recurring_date).month() + 1, // Months are zero-based in JavaScript Date objects
          moment(recurring_date).date(),
          moment(payload.meeting_end_time, "HH:mm").hour(), // Use .hour() to get the hour as a number
          moment(payload.meeting_end_time, "HH:mm").minute(),
        ],

        title: title,
        description: agenda,
        // Other optional properties can be added here such as attendees, etc.
      };

      const file = await new Promise((resolve, reject) => {
        const filename = "ExampleEvent.ics";
        ics.createEvent(event, (error, value) => {
          if (error) {
            reject(error);
          }

          resolve(value, filename, { type: "text/calendar" });
        });
      });

      if (user?.role?.name === "agency") {
        // --------------- Start--------------------
        const [assign_to_data, client_data, attendees_data] = await Promise.all(
          [
            Authentication.findOne({ reference_id: assign_to }).lean(),
            Authentication.findOne({ reference_id: client_id }).lean(),
            Authentication.find({ reference_id: { $in: attendees } }).lean(),
          ]
        );

        const activity_email_template = activityTemplate({
          ...payload,
          status: mark_as_done ? "completed" : "pending",
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data
            ? client_data.first_name + " " + client_data.last_name
            : "",
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          meeting_start_time: momentTimezone
            .utc(meeting_start_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),

          meeting_end_time: momentTimezone
            .utc(meeting_end_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),
        });

        client_data &&
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("emailTemplate", "newActivityMeeting"),
            message: activity_email_template,
            icsContent: file,
          });
        sendEmail({
          email: assign_to_data?.email,
          subject: returnMessage("emailTemplate", "newActivityMeeting"),
          message: activity_email_template,
          icsContent: file,
        });

        attendees_data &&
          attendees_data[0] &&
          attendees_data.map((item) => {
            const activity_email_template = activityTemplate({
              ...payload,
              status: mark_as_done ? "completed" : "pending",
              assigned_by_name: user.first_name + " " + user.last_name,
              client_name: client_data
                ? client_data.first_name + " " + client_data.last_name
                : "",
              assigned_to_name:
                assign_to_data.first_name + " " + assign_to_data.last_name,
            });

            sendEmail({
              email: item?.email,
              subject: returnMessage("emailTemplate", "newActivityMeeting"),
              message: activity_email_template,
              icsContent: file,
            });
          });
        await notificationService.addNotification(
          {
            assign_by: user?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              assign_to_data?.first_name + " " + assign_to_data?.last_name,
            ...payload,
            module_name: "activity",
            activity_type_action: "create_call_meeting",
            activity_type:
              activity_type === "others" ? "activity" : "call meeting",
            meeting_start_time: momentTimezone
              .utc(meeting_start_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            meeting_end_time: momentTimezone
              .utc(meeting_end_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
          },
          newActivity?._id
        );
        // ---------------- End ---------------
      }
      if (user?.role?.name === "team_agency") {
        // --------------- Start--------------------
        const [assign_to_data, client_data, attendees_data] = await Promise.all(
          [
            Authentication.findOne({ reference_id: assign_to }).lean(),
            Authentication.findOne({ reference_id: client_id }).lean(),
            Authentication.find({ reference_id: { $in: attendees } }).lean(),
          ]
        );

        const activity_email_template = activityTemplate({
          ...payload,
          status: mark_as_done ? "completed" : "pending",
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data
            ? client_data.first_name + " " + client_data.last_name
            : "",
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          meeting_start_time: momentTimezone
            .utc(meeting_start_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),

          meeting_end_time: momentTimezone
            .utc(meeting_end_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),
        });

        client_data &&
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("emailTemplate", "newActivityMeeting"),
            message: activity_email_template,
            icsContent: file,
          });
        sendEmail({
          email: assign_to_data?.email,
          subject: returnMessage("emailTemplate", "newActivityMeeting"),
          message: activity_email_template,
          icsContent: file,
        });

        attendees_data &&
          attendees_data[0] &&
          attendees_data.map((item) => {
            const activity_email_template = activityTemplate({
              ...payload,
              status: mark_as_done ? "completed" : "pending",
              assigned_by_name: user.first_name + " " + user.last_name,
              client_name: client_data
                ? client_data.first_name + " " + client_data.last_name
                : "",
              assigned_to_name:
                assign_to_data.first_name + " " + assign_to_data.last_name,

              meeting_start_time: momentTimezone
                .utc(meeting_start_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),

              meeting_end_time: momentTimezone
                .utc(meeting_end_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),
            });

            sendEmail({
              email: item?.email,
              subject: returnMessage("emailTemplate", "newActivityMeeting"),
              message: activity_email_template,
              icsContent: file,
            });
          });

        const agencyData = await Authentication.findOne({
          reference_id: newActivity?.agency_id,
        });

        await notificationService.addNotification(
          {
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            agency_id: agencyData?.reference_id,
            assign_by: user?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              assign_to_data?.first_name + " " + assign_to_data?.last_name,
            ...payload,
            module_name: "activity",
            activity_type_action: "create_call_meeting",
            activity_type:
              activity_type === "others" ? "activity" : "call meeting",
            log_user: "member",
            meeting_start_time: momentTimezone
              .utc(meeting_start_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            meeting_end_time: momentTimezone
              .utc(meeting_end_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
          },
          newActivity?._id
        );
        // ---------------- End ---------------
      }

      return;
    } catch (error) {
      logger.error(`Error while creating call meeting and other: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to fetch the call or other call detials by id
  getActivity = async (activity_id) => {
    try {
      const taskPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "reference_id",
            as: "client_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  client_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$client_Data", preserveNullAndEmptyArrays: true },
        },

        {
          $lookup: {
            from: "activity_type_masters",
            localField: "activity_type",
            foreignField: "_id",
            as: "activity_type",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$activity_type", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$team_Data", preserveNullAndEmptyArrays: true },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
            as: "assign_by",
            pipeline: [
              {
                $project: {
                  name: 1,
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
          $unwind: { path: "$assign_by", preserveNullAndEmptyArrays: true },
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
            _id: new mongoose.Types.ObjectId(activity_id),
            is_deleted: false,
          },
        },
        {
          $project: {
            contact_number: 1,
            title: 1,
            status: "$status.name",
            due_time: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            client_id: 1,
            assign_to: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            client_first_name: "$client_Data.first_name",
            client_last_name: "$client_Data.last_name",
            column_id: "$status.name",
            meeting_start_time: 1,
            meeting_end_time: 1,
            recurring_end_date: 1,
            activity_type: 1,
            attendees: 1,
            internal_info: 1,
          },
        },
      ];
      const activity = await Activity.aggregate(taskPipeline);
      if (activity.length === 0)
        return throwError(
          returnMessage("activity", "activityNotFound"),
          statusCode.notFound
        );
      return activity;
    } catch (error) {
      logger.error(`Error while Getting the activity, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to update the call type activity or other
  updateActivity = async (activity_id, payload, user) => {
    try {
      const activity_exist = await Activity.findById(activity_id)
        .populate("activity_status")
        .lean();
      if (!activity_exist)
        return throwError(
          returnMessage("activity", "activityNotFound"),
          statusCode.notFound
        );

      if (user?.role?.name === "client" || user?.role?.name === "team_client")
        return throwError(
          returnMessage("auth", "unAuthorized"),
          statusCode.forbidden
        );

      if (
        activity_exist?.activity_status?.name === "completed" ||
        activity_exist?.activity_status?.name === "cancel"
      ) {
        return throwError(returnMessage("activity", "ActivityCannotUpdate"));
      }
      validateRequestFields(payload, [
        "title",
        // "client_id",
        "meeting_start_time",
        "meeting_end_time",
        "due_date",
        "assign_to",
        "activity_type",
      ]);

      const {
        client_id,
        assign_to,
        title,
        agenda,
        due_date,
        meeting_start_time,
        meeting_end_time,
        activity_type,
        internal_info,
        attendees,
      } = payload;

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${due_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${due_date}-${meeting_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("activity", "dateinvalid"));

      if (!end_time.isSameOrAfter(start_time))
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
        ActivityType.findOne({
          name: activity_type,
        })
          .select("_id")
          .lean(),
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
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $lte: start_time } },
            { meeting_end_time: { $gte: end_time } },
            { due_date: { $gte: start_date } },
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

      // this below function is used to check weather client is assign to any type of the call or other
      // activity or not if yes then throw an error but it should be in the same agency id not in the other

      let meeting_exist;
      if (user?.role?.name === "agency" && !payload?.mark_as_done) {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.reference_id,
          activity_status: { $eq: activity_status_type?._id },
          activity_type: activity_type_id?._id,
          $or: or_condition,
        })
          .where("_id")
          .ne(activity_id)
          .lean();
      } else if (user?.role?.name === "team_agency" && !payload?.mark_as_done) {
        meeting_exist = await Activity.findOne({
          client_id,
          agency_id: user?.agency_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        })
          .where("_id")
          .ne(activity_id)
          .lean();
      }
      if (meeting_exist)
        return throwError(
          returnMessage("activity", "meetingScheduledForClient")
        );

      // if the user role is agency then we need to check weather team member is assined to other call or not

      if (user?.role?.name === "agency" && !payload?.mark_as_done) {
        const meeting_exist = await Activity.findOne({
          assign_to,
          agency_id: user?.reference_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        })
          .where("_id")
          .ne(activity_id)
          .lean();

        if (meeting_exist)
          return throwError(
            returnMessage("activity", "meetingScheduledForTeam")
          );
      } else if (user?.role?.name === "team_agency" && !payload?.mark_as_done) {
        const meeting_exist = await Activity.findOne({
          assign_to,
          agency_id: user?.agency_id,
          activity_status: { $eq: activity_status_type?._id },
          $or: or_condition,
          activity_type: activity_type_id?._id,
        })
          .where("_id")
          .ne(activity_id)
          .lean();

        if (meeting_exist)
          return throwError(
            returnMessage("activity", "meetingScheduledForTeam")
          );
      }

      let status;
      if (payload?.mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }
      await Activity.findByIdAndUpdate(
        activity_id,
        {
          activity_status: status?._id,
          agency_id: user?.agency_id || user?.reference_id,
          assign_by: user?.reference_id,
          agenda,
          assign_to,
          title,
          client_id,
          internal_info,
          meeting_start_time: start_time,
          meeting_end_time: end_time,
          due_date: start_date,
          recurring_end_date: recurring_date,
          attendees: attendees,
        },
        { new: true }
      );
      if (user?.role?.name === "agency") {
        // --------------- Start--------------------
        let task_status = "update";
        let emailTempKey = "activityUpdated";
        if (payload.mark_as_done) {
          task_status = "completed";
          emailTempKey = "activityCompleted";
        }

        const [assign_to_data, client_data, attendees_data] = await Promise.all(
          [
            Authentication.findOne({ reference_id: assign_to }),
            Authentication.findOne({ reference_id: client_id }),
            Authentication.find({ reference_id: { $in: attendees } }).lean(),
          ]
        );
        const activity_email_template = activityTemplate({
          ...payload,
          status: payload.mark_as_done ? "completed" : "pending",
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data
            ? client_data.first_name + " " + client_data.last_name
            : "",
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          meeting_start_time: momentTimezone
            .utc(meeting_start_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),

          meeting_end_time: momentTimezone
            .utc(meeting_end_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),
        });

        client_data &&
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("emailTemplate", emailTempKey),
            message: activity_email_template,
          });
        sendEmail({
          email: assign_to_data?.email,
          subject: returnMessage("emailTemplate", emailTempKey),
          message: activity_email_template,
        });

        attendees_data &&
          attendees_data[0] &&
          attendees_data.map((item) => {
            const activity_email_template = activityTemplate({
              ...payload,
              status: payload.mark_as_done ? "completed" : "pending",
              assigned_by_name: user.first_name + " " + user.last_name,
              client_name: client_data
                ? client_data.first_name + " " + client_data.last_name
                : "",
              assigned_to_name:
                assign_to_data.first_name + " " + assign_to_data.last_name,
              meeting_start_time: momentTimezone
                .utc(meeting_start_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),

              meeting_end_time: momentTimezone
                .utc(meeting_end_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),
            });

            sendEmail({
              email: item?.email,
              subject: returnMessage("emailTemplate", emailTempKey),
              message: activity_email_template,
            });
          });

        await notificationService.addNotification(
          {
            assign_by: user?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              assign_to_data?.first_name + " " + assign_to_data?.last_name,
            ...payload,
            module_name: "activity",
            activity_type_action: task_status,
            activity_type:
              activity_type === "others" ? "activity" : "call meeting",
            meeting_start_time: momentTimezone
              .utc(meeting_start_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            meeting_end_time: momentTimezone
              .utc(meeting_end_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
          },
          activity_id
        );
        // ---------------- End ---------------
      }
      if (user?.role?.name === "team_agency") {
        // --------------- Start--------------------
        let task_status = "update";
        let emailTempKey = "activityUpdated";
        if (payload.mark_as_done) {
          task_status = "completed";
          emailTempKey = "activityCompleted";
        }

        const [assign_to_data, client_data, attendees_data, agencyData] =
          await Promise.all([
            Authentication.findOne({ reference_id: assign_to }),
            Authentication.findOne({ reference_id: client_id }),
            Authentication.find({ reference_id: { $in: attendees } }).lean(),
            Authentication.findOne({
              reference_id: user?.agency_id
                ? user?.agency_id
                : user?.reference_id,
            }).lean(),
          ]);

        const activity_email_template = activityTemplate({
          ...payload,
          status: payload.mark_as_done ? "completed" : "pending",
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data
            ? client_data.first_name + " " + client_data.last_name
            : "",
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          meeting_start_time: momentTimezone
            .utc(meeting_start_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),

          meeting_end_time: momentTimezone
            .utc(meeting_end_time, "HH:mm")
            .tz("Asia/Kolkata")
            .format("HH:mm"),
        });

        client_data &&
          sendEmail({
            email: client_data?.email,
            subject: returnMessage("emailTemplate", emailTempKey),
            message: activity_email_template,
          });
        sendEmail({
          email: assign_to_data?.email,
          subject: returnMessage("emailTemplate", emailTempKey),
          message: activity_email_template,
        });

        attendees_data &&
          attendees_data[0] &&
          attendees_data.map((item) => {
            const activity_email_template = activityTemplate({
              ...payload,
              status: payload.mark_as_done ? "completed" : "pending",
              assigned_by_name: user.first_name + " " + user.last_name,
              client_name: client_data
                ? client_data.first_name + " " + client_data.last_name
                : "",
              assigned_to_name:
                assign_to_data.first_name + " " + assign_to_data.last_name,
              meeting_start_time: momentTimezone
                .utc(meeting_start_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),

              meeting_end_time: momentTimezone
                .utc(meeting_end_time, "HH:mm")
                .tz("Asia/Kolkata")
                .format("HH:mm"),
            });

            sendEmail({
              email: item?.email,
              subject: returnMessage("emailTemplate", emailTempKey),
              message: activity_email_template,
            });
          });

        await notificationService.addNotification(
          {
            assign_by: user?.reference_id,
            assigned_by_name: user?.first_name + " " + user?.last_name,
            client_name: client_data
              ? client_data.first_name + " " + client_data.last_name
              : "",
            assigned_to_name:
              assign_to_data?.first_name + " " + assign_to_data?.last_name,
            ...payload,
            module_name: "activity",
            activity_type_action: task_status,
            activity_type:
              activity_type === "others" ? "activity" : "call meeting",
            agency_id: user?.agency_id ? user?.agency_id : user?.reference_id,
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            log_user: "member",
            meeting_start_time: momentTimezone
              .utc(meeting_start_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
            meeting_end_time: momentTimezone
              .utc(meeting_end_time, "HH:mm")
              .tz("Asia/Kolkata")
              .format("HH:mm"),
          },
          activity_id
        );
        // ---------------- End ---------------
      }
      return;
    } catch (error) {
      logger.error(`Error while updating call meeting and other: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for to get the activity with date and user based filter
  getActivities = async (payload, user) => {
    try {
      const match_obj = { $match: {} };
      const assign_obj = { $match: {} };
      if (payload?.given_date) {
        match_obj["$match"] = {
          due_date: {
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
        } else if (payload?.filter?.status === "cancel") {
          const activity_status = await ActivityStatus.findOne({
            name: "cancel",
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
            due_date: { $eq: new Date(moment.utc().startOf("day")) },
          };
        } else if (payload?.filter?.date === "tomorrow") {
          filter["$match"] = {
            ...filter["$match"],
            due_date: {
              $eq: new Date(moment.utc().add(1, "day").startOf("day")),
            },
          };
        } else if (payload?.filter?.date === "this_week") {
          filter["$match"] = {
            ...filter["$match"],
            $and: [
              {
                due_date: { $gte: new Date(moment.utc().startOf("week")) },
              },
              {
                due_date: { $lte: new Date(moment.utc().endOf("week")) },
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
                  { due_date: { $gte: new Date(start_date) } },
                  { due_date: { $lte: new Date(end_date) } },
                ],
              },
              {
                $and: [
                  { due_date: { $gte: new Date(start_date) } },
                  { recurring_end_date: { $lte: new Date(end_date) } },
                ],
              },
            ],
          };
        }
        if (
          payload?.filter?.activity_type &&
          payload?.filter?.activity_type !== ""
        ) {
          const activity_type = await ActivityType.findOne({
            name: payload?.filter?.activity_type,
          })
            .select("_id")
            .lean();

          if (!activity_type)
            return throwError(
              returnMessage("activity", "activityTypeNotFound"),
              statusCode.notFound
            );

          filter["$match"] = {
            ...filter["$match"],
            activity_type: activity_type?._id,
          };
        }
      }

      const pagination = paginationObject(payload);
      if (user?.role?.name === "agency") {
        assign_obj["$match"] = {
          is_deleted: false,
          $or: [
            { agency_id: user?.reference_id }, // this is removed because agency can also assign the activity
            { assign_to: user?.reference_id },
          ],
        };
        if (payload?.client_id) {
          assign_obj["$match"] = {
            ...assign_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_id),
          };
        }
        if (payload?.client_team_id) {
          assign_obj["$match"] = {
            ...assign_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_team_id),
          };
        }
        if (payload?.team_id) {
          assign_obj["$match"] = {
            ...assign_obj["$match"],
            assign_to: new mongoose.Types.ObjectId(payload?.team_id),
          };
        }
      } else if (user?.role?.name === "team_agency") {
        // assign_obj["$match"] = {
        //   is_deleted: false,
        //   assign_to: user?.reference_id,
        // };
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");
        // if (teamRole?.role?.name === "admin") {
        assign_obj["$match"] = {
          $or: [
            { assign_by: user.reference_id },
            { assign_to: user.reference_id },
          ],
          is_deleted: false,
          // activity_type: new mongoose.Types.ObjectId(type._id),
          // };
        };
      } else if (user?.role?.name === "client") {
        assign_obj["$match"] = {
          is_deleted: false,
          client_id: user?.reference_id,
          agency_id: new mongoose.Types.ObjectId(payload?.agency_id),
        };
        if (payload?.client_team_id) {
          assign_obj["$match"] = {
            ...assign_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_team_id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        assign_obj["$match"] = {
          is_deleted: false,
          client_id: user?.reference_id,
          agency_id: new mongoose.Types.ObjectId(payload?.agency_id),
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
              "assign_to.first_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_to.last_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "assign_to.name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_id.first_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_id.last_name": {
                $regex: payload?.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_id.name": {
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
            {
              "activity_type.name": {
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
            localField: "assign_to",
            foreignField: "reference_id",
            as: "assign_to",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                  reference_id: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$assign_to", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "reference_id",
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
            localField: "client_id",
            foreignField: "reference_id",
            as: "client_id",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                  reference_id: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$client_id", preserveNullAndEmptyArrays: true },
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
          $lookup: {
            from: "activity_type_masters",
            localField: "activity_type",
            foreignField: "_id",
            as: "activity_type",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$activity_type", preserveNullAndEmptyArrays: true },
        },
      ];

      let activity, total_activity;
      if (!payload?.pagination) {
        activity = await Activity.aggregate(aggragate);

        // this is the basic example of the front side requried to show data
        //   {
        //     id: "123",
        //     start: new Date(2024, 2,1,5,0,0,0),
        //     end: new Date(2024, 3,1,6,0,0,0),
        //     allDay: false,
        //     title: 'Event 1',
        //     description: 'About Planning',
        // }

        let activity_array = [];
        const event = await eventService.eventList(payload, user);
        activity.forEach((act) => {
          if (act?.activity_type?.name === "task") return;
          if (
            act?.activity_type?.name === "others" &&
            act?.recurring_end_date &&
            !payload?.given_date &&
            !payload?.filter
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
          }
          let obj = {
            id: act?._id,
            title: act?.title,
            description: act?.agenda,
            allDay: false,
            start: act?.meeting_start_time,
            end: act?.meeting_end_time,
            status: act?.activity_status?.name,
            type: "activity",
          };

          activity_array.push(obj);
        });

        // for event in calender view
        if (!payload?.given_date) {
          event.forEach((event) => {
            // if (payload?.filter?.date === "period") {
            //   event.recurring_end_date = moment
            //     .utc(payload?.filter?.end_date, "DD-MM-YYYY")
            //     .endOf("day");
            // }
            const event_meetings = this.generateEventTimes(event);

            activity_array = [...activity_array, ...event_meetings];

            // activity_array.push(obj);
          });
        }
        return activity_array;
      } else {
        [activity, total_activity] = await Promise.all([
          Activity.aggregate(aggragate)
            .sort(pagination.sort)
            .skip(pagination.skip)
            .limit(pagination.result_per_page),
          Activity.aggregate(aggragate),
        ]);
      }

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
      const overdue = await Activity_Status_Master.findOne({
        name: "overdue",
      });
      const completed = await Activity_Status_Master.findOne({
        name: "completed",
      });
      const cancel = await Activity_Status_Master.findOne({ name: "cancel" });
      const overdueActivities = await Activity.find({
        due_date: { $lt: currentDate.toDate() },
        activity_status: {
          $nin: [overdue._id, completed._id, cancel._id],
        },
        is_deleted: false,
      }).populate("activity_type");

      for (const activity of overdueActivities) {
        if (activity.activity_type.name === "task") {
          activity.activity_status = overdue._id;
          await activity.save();
        }
      }

      overdueActivities.forEach(async (item) => {
        const [assign_to_data, client_data, assign_by_data] = await Promise.all(
          [
            Authentication.findOne({ reference_id: item?.assign_to }),
            Authentication.findOne({ reference_id: item?.client_id }),
            Authentication.findOne({ reference_id: item?.assign_by }),
          ]
        );

        if (item.activity_type.name !== "task") {
          // await notificationService.addNotification({
          //   module_name: "activity",
          //   activity_type_action: "overdue",
          //   title: item.title,
          //   activity_type:
          //     item?.activity_type.name === "others"
          //       ? "activity"
          //       : "call meeting",
          // });
          // const activity_email_template = activityTemplate({
          //   title: item.title,
          //   agenda: item.agenda,
          //   activity_type: item.activity_type.name,
          //   meeting_end_time: moment(item.meeting_end_time).format("HH:mm"),
          //   meeting_start_time: moment(item.meeting_start_time).format("HH:mm"),
          //   recurring_end_date: item?.recurring_end_date
          //     ? moment(item.recurring_end_date).format("DD-MM-YYYY")
          //     : null,
          //   due_date: moment(item.due_date).format("DD-MM-YYYY"),
          //   status: "overdue",
          //   assigned_by_name:
          //     assign_by_data.first_name + " " + assign_by_data.last_name,
          //   client_name: client_data.first_name + " " + client_data.last_name,
          //   assigned_to_name:
          //     assign_to_data.first_name + " " + assign_to_data.last_name,
          // });
          // sendEmail({
          //   email: client_data?.email,
          //   subject: returnMessage("emailTemplate", "activityInOverdue"),
          //   message: activity_email_template,
          // });
          // sendEmail({
          //   email: assign_to_data?.email,
          //   subject: returnMessage("emailTemplate", "activityInOverdue"),
          //   message: activity_email_template,
          // });
        } else {
          await notificationService.addNotification({
            module_name: "task",
            activity_type_action: "overdue",
            title: item.title,
          });
        }
      });
    } catch (error) {
      logger.error(`Error while Overdue crone Job PDF, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // DueDate crone Job

  dueDateCronJob = async () => {
    try {
      const currentDate = moment().startOf("day"); // Set the time part to midnight for the current date
      const completed = await Activity_Status_Master.findOne({
        name: "completed",
      });
      const overdue = await Activity_Status_Master.findOne({
        name: "overdue",
      });
      const cancel = await Activity_Status_Master.findOne({ name: "cancel" });
      const overdueActivities = await Activity.find({
        due_date: {
          $gte: currentDate.toDate(), // Activities with due date greater than or equal to the current date
          $lt: currentDate.add(1, "days").toDate(), // Activities with due date less than the next day
        },
        activity_status: {
          $nin: [completed._id, cancel._id, overdue._id],
        },
        is_deleted: false,
      }).populate("activity_type");

      overdueActivities?.forEach(async (item) => {
        if (item.activity_type.name !== "task") {
          await notificationService.addNotification({
            module_name: "activity",
            activity_type_action: "dueDateAlert",
            title: item?.title,
            activity_type:
              item?.activity_type.name === "others"
                ? "activity"
                : "call meeting",
          });
        } else {
          await notificationService.addNotification({
            module_name: "task",
            activity_type_action: "dueDateAlert",
            title: item?.title,
          });
        }
      });
    } catch (error) {
      logger.error(`Error while Overdue crone Job PDF, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  meetingAlertCronJob = async (data) => {
    try {
      await notificationService.addNotification(
        {
          ...data,
          module_name: "activity",
          activity_type_action: "meetingAlert",
        },
        data._id
      );

      const clientData = await Authentication.findOne({
        reference_id: data.client_id,
      }).lean();
      const assignByData = await Authentication.findOne({
        reference_id: data.assign_by,
      }).lean();
      const assignToData = await Authentication.findOne({
        reference_id: data.assign_by,
      }).lean();
      const activityStatusName = await Activity_Status_Master.findOne({
        _id: data.activity_status,
      }).lean();
      const activityTypeName = await Activity_Type_Master.findOne({
        _id: data.activity_type,
      }).lean();

      const activity_email_template = activityTemplate({
        ...data,
        status:
          activityStatusName?.name === "in_progress"
            ? "In Progress"
            : activityStatusName.name,
        assigned_by_name:
          assignByData?.first_name + " " + assignByData?.last_name,
        client_name: clientData
          ? clientData.first_name + " " + clientData.last_name
          : "",
        assigned_to_name:
          assignToData?.first_name + " " + assignToData?.last_name,

        activity_type: activityTypeName?.name,
        meeting_end_time: moment(data?.meeting_end_time).format("HH:mm"),
        meeting_start_time: moment(data?.meeting_start_time).format("HH:mm"),
        recurring_end_date: data?.recurring_end_date
          ? moment(data?.recurring_end_date).format("DD-MM-YYYY")
          : null,
        due_date: moment(data?.due_date).format("DD-MM-YYYY"),
      });

      clientData &&
        sendEmail({
          email: clientData?.email,
          subject: returnMessage("emailTemplate", "meetingAlert"),
          message: activity_email_template,
        });

      sendEmail({
        email: assignByData?.email,
        subject: returnMessage("emailTemplate", "meetingAlert"),
        message: activity_email_template,
      });
      if (assignByData?.email !== assignToData?.email) {
        sendEmail({
          email: assignToData?.email,
          subject: returnMessage("emailTemplate", "meetingAlert"),
          message: activity_email_template,
        });
      }
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
          $unwind: "$user",
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
        "due_date",
        "activity_type",
        "meeting_start_time",
        "meeting_end_time",
      ]);

      const {
        client_id,
        due_date,
        meeting_start_time,
        meeting_end_time,
        activity_type,
        attendees,
      } = payload;

      let recurring_date;
      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${due_date}-${meeting_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${due_date}-${meeting_end_time}`,
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
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { meeting_start_time: { $lte: start_time } },
            { meeting_end_time: { $gte: end_time } },
            { due_date: { $gte: start_date } },
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

  tagList = async (searchObj, user) => {
    try {
      let queryObj;
      if (user?.role?.name === "agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();

        queryObj = {
          is_deleted: false,
          agency_id: user.reference_id,
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role?.name === "team_agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");
        if (teamRole?.role?.name === "admin") {
          queryObj = {
            $or: [
              { assign_by: user.reference_id },
              { assign_to: user.reference_id },
            ],
            is_deleted: false,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        } else if (teamRole?.role?.name === "team_member") {
          queryObj = {
            is_deleted: false,
            assign_to: user.reference_id,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      }

      let tags_data = await Activity.find(queryObj).select("tags").lean();
      let tagsList = [];
      tags_data.forEach((item) => {
        let tagData = [];
        item.tags.forEach((tag) => {
          tagData.push(tag.name);
        });

        tagsList = tagsList.concat(tagData);
      });
      let uniqueTags = [
        ...new Set(tagsList.filter((tag) => tag !== undefined)),
      ];
      return uniqueTags;
    } catch (error) {
      logger.error(`Error while fetch tags list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // below function is used for the get the completion points for the agency and agency team member
  completionHistory = async (payload, user) => {
    try {
      const pagination = paginationObject(payload);
      const match_obj = {};

      if (user?.role?.name === "agency") {
        match_obj.agency_id = user?.reference_id;
      } else if (user?.role?.name === "team_agency") {
        match_obj.user_id = user?.reference_id;
      }
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
            foreignField: "reference_id",
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
        Competition_Point.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Competition_Point.aggregate(aggragate),
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
      let total_referral_points;
      const match_condition = { user_id: user?.reference_id };
      if (user?.role?.name === "agency") {
        total_referral_points = await Agency.findById(
          user?.reference_id
        ).lean();
      } else if (user?.role?.name === "team_agency") {
        match_condition.type = { $ne: "referral" };
        total_referral_points = await Team_Agency.findById(
          user?.reference_id
        ).lean();
      }

      const [competition] = await Competition_Point.aggregate([
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
        available_points: total_referral_points?.total_referral_point || 0,
        earned_points: competition?.totalPoints || 0,
      };
    } catch (error) {
      logger.error(`Error while fetching the competition stats: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ActivityService;
