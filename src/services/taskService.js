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
const EventService = require("./eventService");
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

class ActivityService {
  createTask = async (payload, user, files) => {
    try {
      let {
        title,
        agenda,
        due_date,
        assign_to,
        mark_as_done,
        board_id,
        priority,
        status,
        comment,
      } = payload;
      if (payload?.assign_to) {
        payload.assign_to = JSON.parse(assign_to);
      }

      const attachments = [];
      if (files && files.length > 0) {
        files.forEach((file) => {
          attachments.push("uploads/" + file.filename);
        });
      }
      let agency_id;
      if (user?.role === "agency") {
        agency_id = user?._id;
      } else if (user?.role === "team_agency") {
        const workspace_data = await Workspace.findById(user?.workspace).lean();
        const agency_role_id = await Role_Master.findOne({
          name: "agency",
        }).lean();
        const find_agency = workspace_data?.members?.find(
          (user) => user.role.toString() === agency_role_id?._id.toString()
        );
        agency_id = find_agency?.user_id;
      }

      if (due_date && due_date !== "null") {
        var dueDateObject = moment(due_date);
        const duetimeObject = moment(due_date);

        var timeOnly = duetimeObject.format("HH:mm:ss");

        const currentDate = moment().startOf("day");

        if (!dueDateObject.isSameOrAfter(currentDate)) {
          return throwError(returnMessage("activity", "dateinvalid"));
        }
      }

      let activity_status;
      if (mark_as_done === "true") {
        const get_status = await Section.findOne({
          board_id: board_id,
          key: "completed",
        }).lean();
        activity_status = get_status?._id;
      } else {
        activity_status = payload?.status;
      }
      const type = await ActivityType.findOne({ name: "task" }).lean();

      const newTask = new Activity({
        title,
        agenda,
        ...(due_date && due_date !== "null" && { due_time: timeOnly }),
        ...(due_date &&
          due_date !== "null" && { due_date: dueDateObject.toDate() }),
        ...(payload?.assign_to &&
          payload?.assign_to[0] && { assign_to: payload?.assign_to }),
        assign_by: user?._id,
        activity_status: activity_status,
        activity_type: type?._id,
        agency_id,
        attachments: attachments,
        board_id,
        priority,
        workspace_id: user?.workspace,
      });
      const added_task = await newTask.save();

      const comment_payload = { task_id: newTask._id, comment: comment };
      if (comment) {
        this.addTaskComment(comment_payload, user);
      }

      const board = await Board.findOne({ _id: payload?.board_id }).lean();

      // ----------------------- Notification Start -----------------------
      var indianTimeZone = dueDateObject?.tz("Asia/Kolkata").format("HH:mm");
      payload?.assign_to &&
        payload?.assign_to[0] &&
        payload?.assign_to.forEach(async (user_id) => {
          const user_data = await Authentication.findOne({
            _id: user_id,
          }).lean();
          let data = {
            TaskTitle: "New Task Created",
            taskName: capitalizeFirstLetter(title),
            status: capitalizeFirstLetter(status?.name),
            assign_by:
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name),
            dueDate: moment(dueDateObject)?.format("DD/MM/YYYY") ?? "",
            dueTime: indianTimeZone ? indianTimeZone : "",
            agginTo_email: user_data?.email,
            assignName:
              capitalizeFirstLetter(user_data?.first_name) +
              " " +
              capitalizeFirstLetter(user_data?.last_name),
            board_name: board ? capitalizeFirstLetter(board?.project_name) : "",
          };

          const taskMessage = taskTemplate(data);
          sendEmail({
            email: user_data?.email,
            subject: returnMessage("activity", "createSubject"),
            message: taskMessage,
          });
          if (user?.role === "agency") {
            await notificationService.addNotification(
              {
                assign_by: user?._id,
                assigned_by_name: user?.first_name + " " + user?.last_name,
                assigned_to_name:
                  user_data?.first_name + " " + user_data?.last_name,
                ...payload,
                module_name: "task",
                activity_type_action: "createTask",
                activity_type: "task",
                due_time: moment(due_date).format("HH:mm"),
                due_date: moment(due_date).format("DD-MM-YYYY"),
                board_name: board ? board?.project_name : "",
                assign_to: user_data?._id,
                // workspace_id: user?.workspace,
              },
              added_task?._id
            );
          } else if (user?.role === "team_agency") {
            await notificationService.addNotification(
              {
                agency_name:
                  agencyData?.first_name + " " + agencyData?.last_name,
                agency_id: agencyData?._id,
                assigned_by_name: user?.first_name + " " + user?.last_name,

                assigned_to_name:
                  user_data?.first_name + " " + user_data?.last_name,
                ...payload,
                module_name: "task",
                activity_type_action: "createTask",
                activity_type: "task",
                due_time: moment(due_date).format("HH:mm"),
                due_date: moment(due_date).format("DD-MM-YYYY"),
                log_user: "member",
                board_name: board ? board?.project_name : "",
                // workspace_id: user?.workspace,
              },
              added_task?._id
            );
          }
        });

      // ----------------------- Notification END -----------------------

      return added_task;
    } catch (error) {
      logger.error(`Error while creating task : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  taskList = async (searchObj, user) => {
    if (!searchObj.pagination)
      return await this.taskListWithOutPaination(searchObj, user);
    try {
      let queryObj;
      if (user?.role === "agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();

        queryObj = {
          is_deleted: false,
          agency_id: user._id,
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role === "client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user._id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      } else if (user?.role === "team_agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        const teamRole = await Team_Agency.findOne({
          _id: user._id,
        }).populate("role");

        if (teamRole?.role?.name === "admin") {
          queryObj = {
            $or: [{ assign_by: user._id }, { assign_to: user._id }],
            is_deleted: false,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        } else if (teamRole.role.name === "team_member") {
          queryObj = {
            is_deleted: false,
            assign_to: user._id,
            activity_type: new mongoose.Types.ObjectId(type._id),
          };
        }
      } else if (user?.role === "team_client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user._id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type._id),
        };
      }
      const pagination = paginationObject(searchObj);
      const filter = {
        $match: {},
      };
      if (searchObj?.filter) {
        if (searchObj?.filter === "completed") {
          const activity_status = await Section.findOne({
            board_id: searchObj?.board_id,
            key: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }
        if (searchObj?.filter === "in_completed") {
          const activity_status = await Section.findOne({
            board_id: searchObj?.board_id,
            key: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: { $ne: activity_status?._id },
          };
        }
        if (searchObj?.filter === "my_task") {
          filter["$match"] = {
            ...filter["$match"],
            assign_to: { $in: user?._id },
          };
        }
        // Filter for tasks due this week
        if (searchObj?.filter === "due_this_week") {
          const startOfWeek = moment().startOf("week").utc().toDate();
          const endOfWeek = moment().endOf("week").utc().toDate();
          filter["$match"] = {
            ...filter["$match"],
            due_date: { $gte: startOfWeek, $lte: endOfWeek },
          };
        }
        // Filter for tasks due next week
        if (searchObj?.filter === "due_next_week") {
          const startOfNextWeek = moment()
            .add(1, "week")
            .startOf("week")
            .utc()
            .toDate();
          const endOfNextWeek = moment()
            .add(1, "week")
            .endOf("week")
            .utc()
            .toDate();
          filter["$match"] = {
            ...filter["$match"],
            due_date: { $gte: startOfNextWeek, $lte: endOfNextWeek },
          };
        }
      }

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            "status.section_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_by.first_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_by.last_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "team_by.assigned_by_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];
        const keywordType = getKeywordType(searchObj?.search);
        if (keywordType === "number") {
          const numericKeyword = parseInt(searchObj?.search);

          queryObj["$or"].push({
            revenue_made: numericKeyword,
          });
        } else if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
          queryObj["$or"].push({ updatedAt: dateKeyword });
        }
      }
      // let sort_by = {};

      // if (searchObj?.sort_field === "title") {
      //   sort_by.title = searchObj.sort_order === "desc" ? -1 : 1;
      // } else if (searchObj?.sort_field === "due_date") {
      //   sort_by.due_date = searchObj.sort_order === "desc" ? -1 : 1;
      // } else if (searchObj?.sort_field === "priority") {
      //   sort_by.priority = searchObj.sort_order === "desc" ? -1 : 1;
      // } else if (searchObj?.sort_field === "status") {
      //   sort_by["status.section_name"] =
      //     searchObj.sort_order === "desc" ? -1 : 1;
      // } else {
      //   sort_by.createdAt = -1;
      // }

      const taskPipeline = [
        {
          $lookup: {
            from: "authentications",
            let: { assign_to_ids: "$assign_to" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$assign_to_ids"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                },
              },
            ],
            as: "team_data",
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { section_name: 1, _id: 1 } }],
          },
        },
        {
          $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
        },
        {
          $match: {
            ...queryObj,
            board_id: new mongoose.Types.ObjectId(searchObj?.board_id),
          },
        },
        filter,

        {
          $project: {
            contact_number: 1,
            activity_status: 1,
            title: 1,
            status: "$status",
            due_time: 1,
            assign_to: "$team_data",
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            assign_by: 1,
            assigned_by_first_name: "$team_by.first_name",
            assigned_by_last_name: "$team_by.last_name",
            assigned_by_name: "$team_by.assigned_by_name",
            column_id: "$status.name",
            agency_id: 1,
            board_id: 1,
            priority: 1,
          },
        },
      ];

      // Conditionally add the $sort stage
      if (searchObj.sort_field === "status") {
        const sortOrder = searchObj.sort_order === "desc" ? -1 : 1;
        taskPipeline.push({
          $sort: { "status.section_name": sortOrder },
        });
      }

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
      if (user?.role === "agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();

        queryObj = {
          is_deleted: false,
          agency_id: user?._id,
          activity_type: new mongoose.Types.ObjectId(type?._id),
        };
      } else if (user?.role === "client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user?._id,
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
          activity_type: new mongoose.Types.ObjectId(type?._id),
        };
      } else if (user?.role === "team_agency") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        const teamRole = await Team_Agency.findOne({
          _id: user._id,
        }).populate("role");
        if (teamRole?.role === "admin") {
          queryObj = {
            $or: [{ assign_by: user?._id }, { assign_to: user?._id }],
            is_deleted: false,
            activity_type: new mongoose.Types.ObjectId(type?._id),
          };
        } else if (teamRole.role.name === "team_member") {
          queryObj = {
            is_deleted: false,
            assign_to: user?._id,
            activity_type: new mongoose.Types.ObjectId(type?._id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        const type = await ActivityType.findOne({ name: "task" }).lean();
        queryObj = {
          is_deleted: false,
          client_id: user?._id,
          activity_type: new mongoose.Types.ObjectId(type?._id),
          agency_id: new mongoose.Types.ObjectId(searchObj?.agency_id),
        };
      }
      const filter = {
        $match: {},
      };

      if (searchObj?.filter) {
        if (searchObj?.filter === "completed") {
          const activity_status = await Section.findOne({
            board_id: searchObj?.board_id,
            key: "completed",
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: activity_status?._id,
          };
        }
        if (searchObj?.filter === "in_completed") {
          const activity_status = await Section.findOne({
            board_id: searchObj?.board_id,
            key: { $ne: "completed" },
          })
            .select("_id")
            .lean();
          filter["$match"] = {
            ...filter["$match"],
            activity_status: { $ne: activity_status?._id },
          };
        }
        if (searchObj?.filter === "my_task") {
          filter["$match"] = {
            ...filter["$match"],
            assign_to: { $in: user?._id },
          };
        }
        // Filter for tasks due this week
        if (searchObj?.filter === "due_this_week") {
          const startOfWeek = moment().startOf("week").utc().toDate();
          const endOfWeek = moment().endOf("week").utc().toDate();
          filter["$match"] = {
            ...filter["$match"],
            due_date: { $gte: startOfWeek, $lte: endOfWeek },
          };
        }
        // Filter for tasks due next week
        if (searchObj?.filter === "due_next_week") {
          const startOfNextWeek = moment()
            .add(1, "week")
            .startOf("week")
            .utc()
            .toDate();
          const endOfNextWeek = moment()
            .add(1, "week")
            .endOf("week")
            .utc()
            .toDate();
          filter["$match"] = {
            ...filter["$match"],
            due_date: { $gte: startOfNextWeek, $lte: endOfNextWeek },
          };
        }

        // Filter for
        if (searchObj?.section_id) {
          filter["$match"] = {
            ...filter["$match"],
            activity_status: new mongoose.Types.ObjectId(searchObj?.section_id),
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
            let: { assign_to_ids: "$assign_to" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$assign_to_ids"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                },
              },
            ],
            as: "team_data",
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { section_name: 1 } }],
          },
        },
        {
          $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
        },

        {
          $match: {
            ...queryObj,
            board_id: new mongoose.Types.ObjectId(searchObj?.board_id),
          },
        },
        filter,
        {
          $project: {
            contact_number: 1,
            title: 1,
            status: "$status",
            due_time: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            assign_to: "$team_data",
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            column_id: "$status.name",
            board_id: 1,
            priority: 1,
            attachment_count: { $size: "$attachments" },
            comments_count: { $size: "$comments" },
          },
        },
      ];

      if (!searchObj?.section_id) {
        taskPipeline.push(
          {
            $group: {
              _id: "$status.section_name",
              data: { $push: "$$ROOT" },
            },
          },
          {
            $project: {
              data: { $slice: ["$data", searchObj?.task_count || 5] },
            },
          },
          {
            $unwind: { path: "$data", preserveNullAndEmptyArrays: true },
          },
          {
            $replaceRoot: { newRoot: "$data" },
          }
        );
      }

      const query = Activity.aggregate(taskPipeline).sort({ createdAt: -1 });

      if (searchObj.section_id) {
        query.skip(searchObj.skip).limit(searchObj.limit);
      }

      const activity = await query;

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
            let: { assign_to_ids: "$assign_to" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$assign_to_ids"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                },
              },
            ],
            as: "team_data",
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { section_name: 1 } }],
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
            status: "$status",
            agenda: 1,
            assigned_by_name: "$assign_by.name",
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: "$assigned_by_name",
            activity_type: 1,
            attachments: 1,
            internal_info: 1,
            assign_to: "$team_data",
            priority: 1,
            board_id: 1,
            mark_as_done: 1,
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

  deleteTask = async (payload, user) => {
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
            let: { assign_to_ids: "$assign_to" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$assign_to_ids"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  profile_image: 1,
                  assigned_to_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
            as: "team_data",
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { section_name: 1 } }],
          },
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
            status: "$status",
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            column_id: "$status.name",
            assign_to: "$team_data",
            due_date: 1,
            due_time: 1,
            title: 1,
            board_id: 1,
          },
        },
      ];
      const getTask = await Activity.aggregate(pipeline);
      getTask.forEach(async (task) => {
        const board = await Board.findOne({ _id: task?.board_id }).lean();
        task?.assign_to?.forEach(async (member) => {
          let data = {
            TaskTitle: "Deleted Task",
            taskName: task?.title,
            status: task?.status?.section_name,
            assign_by: task?.assigned_by_name,
            dueDate: moment(task?.due_date)?.format("DD/MM/YYYY"),
            dueTime: task?.due_time,
            agginTo_email: member?.email,
            assignName: member?.assigned_to_name,
            board_name: board ? board?.project_name : "",
          };
          const taskMessage = taskTemplate(data);
          await sendEmail({
            email: member?.email,
            subject: returnMessage("activity", "taskDeleted"),
            message: taskMessage,
          });
          await notificationService.addNotification(
            {
              title: task?.title,
              module_name: "task",
              activity_type_action: "deleted",
              activity_type: "task",
              assign_to: member?._id,
              // workspace_id: user?.workspace,
            },
            task?._id
          );
          return;
        });
      });

      return;
    } catch (error) {
      logger.error(`Error while Deleting task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  deleteActivityTask = async (payload) => {
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
            as: "team_data",
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
          $unwind: { path: "$team_data", preserveNullAndEmptyArrays: true },
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
            assigned_to_first_name: "$team_data.first_name",
            assigned_to_last_name: "$team_data.last_name",
            assigned_to_name: "$team_data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_data.email",
            due_date: 1,
            due_time: 1,
            title: 1,
            assign_to: 1,
            client_id: 1,
            board_id: 1,
          },
        },
      ];
      const getTask = await Activity.aggregate(pipeline);
      getTask.forEach(async (task) => {
        const board = await Board.findOne({ _id: task?.board_id }).lean();

        let data = {
          TaskTitle: "Deleted Task",
          taskName: task?.title,
          status: task?.status,
          assign_by: task?.assigned_by_name,
          dueDate: moment(task?.due_date)?.format("DD/MM/YYYY"),
          dueTime: task?.due_time,
          agginTo_email: task?.assign_email,
          assignName: task?.assigned_to_name,
          board_name: board ? board?.project_name : "",
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
      let {
        title,
        agenda,
        due_date,
        assign_to,
        mark_as_done,
        priority,
        status,
        board_id,
      } = payload;

      const status_check = await Activity.findById(id).populate(
        "activity_status"
      );
      if (status_check?.activity_status?.name === "completed") {
        return throwError(returnMessage("activity", "CannotUpdate"));
      }
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

      if (due_date && due_date !== "null") {
        var dueDateObject = moment(due_date);
        const duetimeObject = moment(due_date);

        let updatedData = await Activity.findById(id).lean();
        var timeOnly = duetimeObject.format("HH:mm:ss");

        const currentDate = moment().startOf("day");
        let check_due_date = moment(updatedData.due_date);
        if (!check_due_date.isSame(dueDateObject)) {
          if (!dueDateObject.isSameOrAfter(currentDate)) {
            return throwError(returnMessage("activity", "dateinvalid"));
          }
        }
      }

      // let status;
      // if (mark_as_done === true) {
      //   status = await ActivityStatus.findOne({ name: "completed" }).lean();
      // }

      const get_complete_status = await Section.findOne({
        board_id: board_id,
        key: "completed",
      }).lean();
      let activity_status;
      if (mark_as_done === "true") {
        activity_status = get_complete_status?._id;
      } else {
        activity_status = payload?.status;
      }

      if (payload?.assign_to) {
        payload.assign_to = JSON.parse(assign_to);
      }

      const current_activity = await Activity.findById(id).lean();
      let updateTasksPayload = {
        title,
        agenda,
        ...(due_date && due_date !== "null" && { due_time: timeOnly }),
        ...(due_date &&
          due_date !== "null" && { due_date: dueDateObject.toDate() }),
        ...(payload?.assign_to &&
          payload?.assign_to[0] && { assign_to: payload?.assign_to }),
        activity_status: activity_status,
        ...(attachments?.length > 0 && { attachments }),
        priority,
        ...(mark_as_done && mark_as_done === "true" && { mark_as_done: true }),
      };
      const updateTasks = await Activity.findByIdAndUpdate(
        id,
        updateTasksPayload,
        { new: true, useFindAndModify: false }
      );
      const current_status = current_activity?.activity_status;

      // if (current_status?.toString() !== status?._id.toString()) {
      //   const referral_data = await Configuration.findOne().lean();

      //   if (
      //     current_status?.toString() ===
      //       (
      //         await Section.findOne({
      //           board_id: board_id,
      //           is_completed: true,
      //         }).lean()
      //       )?._id?.toString() &&
      //     (status?.name === "pending" ||
      //       status?.name === "in_progress" ||
      //       status?.name === "overdue")
      //   ) {
      //     await Activity.findOneAndUpdate(
      //       { _id: id },
      //       {
      //         $inc: {
      //           competition_point:
      //             -referral_data?.competition?.successful_task_competition,
      //         },
      //       },
      //       { new: true }
      //     );

      //     const userData = await Authentication.findOne({
      //       _id: current_activity.assign_to,
      //     }).populate("role", "name");

      //     if (userData.role === "agency") {
      //       await Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }

      //     if (userData.role === "team_agency") {
      //       await Team_Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }

      //     const assign_role = await Authentication.findOne({
      //       _id: current_activity.assign_to,
      //     }).populate("role", "name");

      //     await Competition_Point.create({
      //       user_id: current_activity.assign_to,
      //       agency_id: current_activity.agency_id,
      //       point:
      //         -referral_data.competition.successful_task_competition?.toString(),
      //       type: "task",
      //       role: assign_role?.role?.name,
      //     });

      //     const agencyData = await Authentication.findOne({
      //       _id: current_activity.agency_id,
      //     });

      //     await notificationService.addNotification({
      //       module_name: "referral",
      //       action_type: "taskDeduct",
      //       task_name: current_activity?.title,
      //       referred_by: agencyData?.first_name + " " + agencyData?.last_name,
      //       receiver_id: current_activity?.agency_id,
      //       points:
      //         referral_data.competition.successful_task_competition?.toString(),
      //     });
      //   }

      //   if (
      //     (current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "pending" }).lean()
      //       )?._id?.toString() &&
      //       status?.name === "completed") ||
      //     (current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "overdue" }).lean()
      //       )?._id?.toString() &&
      //       status?.name === "completed") ||
      //     (current_status.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "in_progress" }).lean()
      //       )?._id.toString() &&
      //       status?.name === "completed")
      //   ) {
      //     await Activity.findOneAndUpdate(
      //       { _id: id },
      //       {
      //         $inc: {
      //           competition_point:
      //             referral_data?.competition?.successful_task_competition,
      //         },
      //       },
      //       { new: true }
      //     );

      //     if (userData?.role === "agency") {
      //       await Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }
      //     if (userData?.role === "team_agency") {
      //       await Team_Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }

      //     const assign_role = await Authentication.findOne({
      //       _id: current_activity.assign_to,
      //     }).populate("role", "name");

      //     await Competition_Point.create({
      //       user_id: current_activity.assign_to,
      //       agency_id: current_activity.agency_id,
      //       point:
      //         +referral_data.competition.successful_task_competition?.toString(),
      //       type: "task",
      //       role: assign_role?.role?.name,
      //     });

      //     const agencyData = await Authentication.findOne({
      //       _id: current_activity.agency_id,
      //     });

      //     await notificationService.addNotification({
      //       module_name: "referral",
      //       action_type: "taskAdded",
      //       task_name: current_activity?.title,
      //       referred_by: agencyData?.first_name + " " + agencyData?.last_name,
      //       receiver_id: current_activity?.agency_id,
      //       points:
      //         referral_data.competition.successful_task_competition?.toString(),
      //     });
      //   }
      // }

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "_id",
            as: "team_data",
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
          $unwind: { path: "$team_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
            from: "sections",
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
            assigned_to_first_name: "$team_data.first_name",
            assigned_to_last_name: "$team_data.last_name",
            assigned_to_name: "$team_data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
            assign_email: "$team_data.email",
            agency_id: 1,
            status_name: "$statusName.section_name",
            board_id: 1,
          },
        },
      ];
      const getTask = await Activity.aggregate(pipeline);
      const board = await Board.findOne({ _id: getTask[0]?.board_id }).lean();
      payload?.assign_to &&
        payload?.assign_to[0] &&
        payload?.assign_to.forEach(async (user_id) => {
          var user_data = await Authentication.findOne({
            _id: user_id,
          }).lean();

          let data = {
            TaskTitle: "Updated Task ",
            taskName: title,
            status:
              payload?.mark_as_done === "true"
                ? "Completed"
                : getTask[0]?.status_name,
            assign_by: capitalizeFirstLetter(getTask[0]?.assigned_by_name),
            dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
            dueTime: timeOnly,
            agginTo_email: user_data?.email,
            assignName:
              capitalizeFirstLetter(user_data?.first_name) +
              " " +
              capitalizeFirstLetter(user_data?.last_name),
            board_name: board ? board?.project_name : "",
          };

          let client_data = false;
          if (payload?.client_id !== "null" && payload?.client_id)
            client_data = await Authentication.findOne({
              reference_id: payload?.client_id,
            }).lean();

          const taskMessage = taskTemplate(data);
          sendEmail({
            email: user_data?.email,
            subject: returnMessage("activity", "UpdateSubject"),
            message: taskMessage,
          });

          if (logInUser?.role === "agency") {
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
                assigned_to_name:
                  capitalizeFirstLetter(user_data?.first_name) +
                  " " +
                  capitalizeFirstLetter(user_data?.last_name),
                due_time: new Date(due_date).toTimeString().split(" ")[0],
                due_date: new Date(due_date).toLocaleDateString("en-GB"),
                board_name: board ? board?.project_name : "",
                assign_to: user_data?._id,
                // workspace_id: logInUser?.workspace,
              },
              id
            );

            // -------------- Socket notification end --------------------
          } else if (logInUser?.role === "team_agency") {
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
                agency_name:
                  agencyData?.first_name + " " + agencyData?.last_name,
                agency_id: getTask[0]?.agency_id,
                assigned_to_name: getTask[0]?.assigned_to_name,
                due_time: new Date(due_date).toTimeString().split(" ")[0],
                due_date: new Date(due_date).toLocaleDateString("en-GB"),
                log_user: "member",
                board_name: board ? board?.project_name : "",
                // workspace_id: logInUser?.workspace,
              },
              id
            );

            // -------------- Socket notification end --------------------
          }
        });

      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  updateTaskStatus = async (payload, id, user) => {
    try {
      const { status } = payload;
      let update_status = status;
      // if (status === "completed") {
      //   update_status = await ActivityStatus.findOne({
      //     name: "completed",
      //   }).lean();
      // } else if (status === "pending") {
      //   update_status = await ActivityStatus.findOne({
      //     name: "pending",
      //   }).lean();
      // } else if (status === "in_progress") {
      //   update_status = await ActivityStatus.findOne({
      //     name: "in_progress",
      //   }).lean();
      // } else if (status === "overdue") {
      //   update_status = await ActivityStatus.findOne({
      //     name: "overdue",
      //   }).lean();
      // } else if (status === "cancel") {
      //   update_status = await ActivityStatus.findOne({
      //     name: "cancel",
      //   }).lean();
      // }
      let current_activity = await Activity.findById(id).lean();
      let current_status = current_activity.activity_status;

      const updateTasks = await Activity.findByIdAndUpdate(
        {
          _id: id,
        },
        {
          activity_status: update_status,
        },
        { new: true, useFindAndModify: false }
      );
      const type = await ActivityType.findOne({ name: "task" }).lean();
      // if (
      //   current_status?.toString() !== update_status?.toString() &&
      //   current_activity?.activity_type?.toString() === type?._id?.toString()
      // ) {
      //   const referral_data = await Configuration.findOne().lean();

      //   // Decrement completion points if transitioning from completed to pending, in_progress, or overdue
      //   if (
      //     current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "completed" }).lean()
      //       )?._id?.toString() &&
      //     (update_status?.name === "pending" ||
      //       update_status?.name === "in_progress" ||
      //       update_status?.name === "overdue")
      //   ) {
      //     await Activity.findOneAndUpdate(
      //       { _id: id },
      //       {
      //         $inc: {
      //           competition_point:
      //             -referral_data?.competition?.successful_task_competition,
      //         },
      //       },
      //       { new: true }
      //     );

      //     const assign_role = await Authentication.findOne({
      //       reference_id: current_activity.assign_to,
      //     }).populate("role", "name");

      //     if (assign_role?.role?.name === "agency") {
      //       await Agency.findOneAndUpdate(
      //         { _id: current_activity.agency_id },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     } else if (assign_role?.role?.name === "team_agency") {
      //       await Team_Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     } else if (assign_role?.role?.name === "team_client") {
      //       await Team_Client.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               -referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }

      //     await Competition_Point.create({
      //       user_id: current_activity.assign_to,
      //       agency_id: current_activity.agency_id,
      //       point:
      //         -referral_data.competition.successful_task_competition?.toString(),
      //       type: "task",
      //       role: assign_role?.role?.name,
      //     });

      //     const agencyData = await Authentication.findOne({
      //       reference_id: current_activity.agency_id,
      //     });

      //     await notificationService.addNotification({
      //       module_name: "referral",
      //       action_type: "taskDeduct",
      //       task_name: current_activity?.title,
      //       referred_by: agencyData?.first_name + " " + agencyData?.last_name,
      //       receiver_id: current_activity?.agency_id,
      //       points:
      //         referral_data.competition.successful_task_competition?.toString(),
      //     });
      //   }

      //   // Increment completion points if transitioning from pending or overdue to completed
      //   if (
      //     (current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "pending" }).lean()
      //       )?._id?.toString() &&
      //       update_status?.name === "completed") ||
      //     (current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "overdue" }).lean()
      //       )?._id?.toString() &&
      //       update_status?.name === "completed") ||
      //     (current_status?.toString() ===
      //       (
      //         await ActivityStatus.findOne({ name: "in_progress" }).lean()
      //       )?._id?.toString() &&
      //       update_status?.name === "completed")
      //   ) {
      //     await Activity.findOneAndUpdate(
      //       { _id: id },
      //       {
      //         $inc: {
      //           competition_point:
      //             referral_data?.competition?.successful_task_competition,
      //         },
      //       },
      //       { new: true }
      //     );
      //     const assign_role = await Authentication.findOne({
      //       reference_id: current_activity.assign_to,
      //     }).populate("role", "name");

      //     if (assign_role?.role?.name === "agency") {
      //       await Agency.findOneAndUpdate(
      //         { _id: current_activity.agency_id },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     } else if (assign_role?.role?.name === "team_agency") {
      //       await Team_Agency.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     } else if (assign_role?.role?.name === "team_client") {
      //       await Team_Client.findOneAndUpdate(
      //         { _id: current_activity.assign_to },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_task_competition,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }

      //     await Competition_Point.create({
      //       user_id: current_activity.assign_to,
      //       agency_id: current_activity.agency_id,
      //       point:
      //         +referral_data.competition.successful_task_competition?.toString(),
      //       type: "task",
      //       role: assign_role?.role?.name,
      //     });

      //     const agencyData = await Authentication.findOne({
      //       reference_id: current_activity.agency_id,
      //     });

      //     await notificationService.addNotification({
      //       module_name: "referral",
      //       action_type: "taskAdded",
      //       task_name: current_activity?.title,
      //       referred_by: agencyData?.first_name + " " + agencyData?.last_name,
      //       receiver_id: current_activity?.agency_id,
      //       points:
      //         referral_data.competition.successful_task_competition?.toString(),
      //     });
      //   }
      // }

      const pipeline = [
        {
          $lookup: {
            from: "authentications",
            let: { assign_to_ids: "$assign_to" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ["$_id", "$$assign_to_ids"],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
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
            as: "team_data",
          },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "assign_by",
            foreignField: "_id",
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
          $lookup: {
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { section_name: 1 } }],
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
            agenda: 1,
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            column_id: "$status",
            due_date: 1,
            due_time: 1,
            title: 1,
            activity_type: "$activity_type",
            assign_to: "$team_data",
            assign_by: 1,
            board_id: 1,
            priority: 1,
            status: "$status",
          },
        },
      ];

      const getTask = await Activity.aggregate(pipeline);
      const [board] = await Promise.all([
        Board.findOne({ _id: getTask[0]?.board_id }).lean(),
      ]);

      getTask &&
        getTask[0] &&
        getTask[0]?.assign_to?.forEach(async (assignee) => {
          if (getTask[0].activity_type?.name === "task") {
            let data = {
              TaskTitle: "Task status update",
              taskName: getTask[0]?.title,
              status: getTask[0]?.status?.section_name,
              assign_by: getTask[0]?.assigned_by_name,
              dueDate: moment(getTask[0]?.due_date)?.format("DD/MM/YYYY"),
              dueTime: getTask[0]?.due_time,
              agginTo_email: assignee?.email,
              assignName: assignee?.assigned_to_name,
              board_name: board ? board?.project_name : "",
            };
            const taskMessage = taskTemplate(data);
            sendEmail({
              email: assignee?.email,
              subject: returnMessage("activity", "taskStatusUpdate"),
              message: taskMessage,
            });

            if (user?.role === "agency") {
              //   ----------    Notifications start ----------
              await notificationService.addNotification(
                {
                  assigned_to_name: assignee?.assigned_to_name,
                  ...getTask[0],
                  module_name: "task",
                  assign_to: assignee?._id,
                  activity_type_action: "statusUpdate",
                  activity_type: "task",
                  meeting_start_time: moment(
                    getTask[0]?.meeting_start_time
                  ).format("HH:mm"),
                  due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
                  board_name: board ? board?.project_name : "",
                  status: getTask[0]?.status?.section_name,
                  // workspace_id: user?.workspace,
                },
                id
              );
              //   ----------    Notifications end ----------
            } else if (user.role === "team_agency") {
              const agencyData = await Authentication.findById(
                getTask[0].assign_by._id
              );

              //   ----------    Notifications start ----------
              await notificationService.addNotification(
                {
                  agency_name:
                    agencyData?.first_name + " " + agencyData?.last_name,
                  assigned_to_name: assigned_to_name,
                  ...getTask[0],
                  module_name: "task",
                  assign_to: assignee?._id,
                  log_user: "member",
                  activity_type_action: "statusUpdate",
                  activity_type: "task",
                  meeting_start_time: moment(
                    getTask[0]?.meeting_start_time
                  ).format("HH:mm"),
                  due_date: moment(getTask[0]?.due_date).format("DD-MM-YYYY"),
                  assigned_by_name: getTask[0]?.assigned_by_name,
                  assign_by: agencyData?._id,
                  board_name: board ? board?.project_name : "",
                  status: getTask[0]?.status?.section_name,
                  // workspace_id: user?.workspace,
                },
                id
              );
              //   ----------    Notifications end ----------
            }
          }
        });

      return getTask;
    } catch (error) {
      logger.error(`Error while Updating status, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
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
        due_date: { $lt: currentDate.toDate() },
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

  // DueDate crone Job

  dueDateCronJob = async () => {
    try {
      const currentDate = moment().startOf("day"); // Set the time part to midnight for the current date
      const completed = await Section.findOne({
        key: "completed",
      });
      const overdue = await Section.findOne({
        key: "overdue",
      });
      const overdueActivities = await Activity.find({
        due_date: {
          $gte: currentDate.toDate(), // Activities with due date greater than or equal to the current date
          $lt: currentDate.add(1, "days").toDate(), // Activities with due date less than the next day
        },
        activity_status: {
          $nin: [completed._id, overdue._id],
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

  addTaskComment = async (payload, user) => {
    try {
      const { comment, task_id } = payload;
      const task = await Activity.findById(task_id);

      task.comments.push({ user_id: user?._id, comment: comment });
      task.save();
      return;
    } catch (error) {
      logger.error(`Error while Add task comment: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  listTaskComment = async (payload, user) => {
    try {
      const { task_id } = payload;
      const task = await Activity.findById(task_id);

      let comments = [];
      if (task && task?.comments?.length > 0) {
        for (const item of task?.comments) {
          const user_data = await Authentication.findById(item?.user_id).lean();
          comments.push({
            comment: item?.comment,
            user_image: user_data?.profile_image,
            name: user_data?.first_name + " " + user_data?.last_name,
            user_id: user_data?._id,
          });
        }
      }
      // const users_comments = comments.filter(
      //   (item) => item.user_id.toString() === user._id.toString()
      // );

      return comments;
    } catch (error) {
      logger.error(`Error while Add task comment: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  leaveTask = async (payload, user) => {
    try {
      const { task_id } = payload;
      const task = await Activity.findById(task_id);
      task.assign_to = task?.assign_to.filter(
        (item) => item.toString() !== user._id.toString()
      );
      task.save();
      return;
    } catch (error) {
      logger.error(`Error while Add task comment: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ActivityService;
