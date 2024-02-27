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
const notificationService = new NotificationService();

class ActivityService {
  createTask = async (payload, user) => {
    try {
      const { title, agenda, due_date, assign_to, client_id, mark_as_done } =
        payload;
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

      if (dueDateObject.isSameOrBefore(currentDate)) {
        return throwError(returnMessage("activity", "dateinvalid"));
      }
      let status;
      if (mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }

      const type = await ActivityType.findOne({ name: "task" }).lean();

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
          },
        },
      ];

      const getTask = await Activity.aggregate(pipeline);
      let data = {
        TaskTitle: "New Task Created",
        taskName: title,
        status: status?.name,
        assign_by: user.first_name + " " + user.last_name,
        dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
        dueTime: timeOnly,
        agginTo_email: getTask[0]?.assign_email,
        assignName: getTask[0]?.assigned_to_name,
      };
      const taskMessage = taskTemplate(data);
      await sendEmail({
        email: getTask[0]?.assign_email,
        subject: returnMessage("activity", "createSubject"),
        message: taskMessage,
      });
      // ----------------------- Notification Start -----------------------
      const client_data = await Authentication.findOne({
        reference_id: client_id,
      });
      await notificationService.addNotification(
        {
          assign_by: user.reference_id,
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data.first_name + " " + client_data.last_name,
          assigned_to_name:
            getTask[0].assigned_to_first_name +
            " " +
            getTask[0].assigned_to_last_name,
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
          $unwind: "$client_Data",
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
          $unwind: "$team_Data",
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
          $unwind: "$team_by",
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
            assign_by: 1,
            assigned_by_first_name: "$team_by.first_name",
            assigned_by_last_name: "$team_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$team_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
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
          $unwind: "$client_Data",
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
            assigned_by_first_name: "$assign_by.first_name",
            assigned_by_last_name: "$assign_by.last_name",
            assigned_to_first_name: "$team_Data.first_name",
            assigned_to_last_name: "$team_Data.last_name",
            assigned_to_name: "$team_Data.assigned_to_name",
            assigned_by_name: "$assign_by.assigned_by_name",
            client_name: "$client_Data.client_name",
            column_id: "$status.name",
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
            pipeline: [{ $project: { name: 1, first_name: 1, last_name: 1 } }],
          },
        },
        {
          $unwind: "$client_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "assign_to",
            foreignField: "reference_id",
            as: "team_Data",
            pipeline: [{ $project: { name: 1, first_name: 1, last_name: 1 } }],
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
            pipeline: [{ $project: { name: 1, first_name: 1, last_name: 1 } }],
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
      console.log(getTask);
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

        await sendEmail({
          email: task?.assign_email,
          subject: returnMessage("activity", "UpdateSubject"),
          message: taskMessage,
        });
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

  updateTask = async (payload, id) => {
    try {
      const { title, agenda, due_date, assign_to, client_id, mark_as_done } =
        payload;
      const status_check = await Activity.findById(id).populate(
        "activity_status"
      );
      if (status_check?.activity_status?.name === "completed") {
        return throwError(returnMessage("activity", "CannotUpdate"));
      }
      const dueDateObject = moment(due_date);
      const duetimeObject = moment(due_date);

      const timeOnly = duetimeObject.format("HH:mm:ss");

      const currentDate = moment().startOf("day");

      if (dueDateObject.isSameOrBefore(currentDate)) {
        return throwError(returnMessage("activity", "dateinvalid"));
      }
      let status;
      if (mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }

      const updateTasks = await Activity.findByIdAndUpdate(
        {
          _id: id,
        },
        {
          title,
          agenda,
          due_date: dueDateObject.toDate(),
          due_time: timeOnly,
          assign_to,
          client_id,
          activity_status: status._id,
        },
        { new: true, useFindAndModify: false }
      );
      const current_activity = await Activity.findById(id).lean();
      const current_status = current_activity?.activity_status;

      if (current_status.toString() !== status._id.toString()) {
        const referral_data = await Configuration.findOne().lean();

        if (
          current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "completed" }).lean()
            )._id.toString() &&
          (status.name === "pending" ||
            status.name === "in_progress" ||
            status.name === "overdue")
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
          await Authentication.findOneAndUpdate(
            { reference_id: current_activity.agency_id },
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
              -referral_data.competition.successful_task_competition.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });
        }

        if (
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "pending" }).lean()
            )._id.toString() &&
            status.name === "completed") ||
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "overdue" }).lean()
            )._id.toString() &&
            status.name === "completed") ||
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "in_progress" }).lean()
            )._id.toString() &&
            status.name === "completed")
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
          await Authentication.findOneAndUpdate(
            { reference_id: current_activity.agency_id },
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
              +referral_data.competition.successful_task_competition.toString(),
            type: "task",
            role: assign_role?.role?.name,
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
          },
        },
      ];

      const getTask = await Activity.aggregate(pipeline);
      let data = {
        TaskTitle: "Updated Task ",
        taskName: title,
        status: status?.name,
        assign_by: getTask[0]?.assigned_by_name,
        dueDate: moment(dueDateObject)?.format("DD/MM/YYYY"),
        dueTime: timeOnly,
        agginTo_email: getTask[0]?.assign_email,
        assignName: getTask[0]?.assigned_to_name,
      };
      const taskMessage = taskTemplate(data);
      await sendEmail({
        email: getTask[0]?.assign_email,
        subject: returnMessage("activity", "UpdateSubject"),
        message: taskMessage,
      });

      // -------------- Socket notification start --------------------

      const client_data = await Authentication.findOne({
        reference_id: client_id,
      });
      let taskAction = "update";
      // For Complete
      if (mark_as_done) taskAction = "completed";
      await notificationService.addNotification(
        {
          ...payload,
          module_name: "task",
          activity_type_action: taskAction,
          activity_type: "task",
          agenda: agenda,
          title: title,
          client_name: client_data.first_name + " " + client_data.last_name,
          assigned_to_name: getTask[0]?.assigned_to_name,
          due_time: new Date(due_date).toTimeString().split(" ")[0],
          due_date: new Date(due_date).toLocaleDateString("en-GB"),
        },
        id
      );

      // -------------- Socket notification end --------------------

      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  statusUpdate = async (payload, id) => {
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

      if (current_status.toString() !== update_status._id.toString()) {
        const referral_data = await Configuration.findOne().lean();

        // Decrement completion points if transitioning from completed to pending, in_progress, or overdue
        if (
          current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "completed" }).lean()
            )._id.toString() &&
          (update_status.name === "pending" ||
            update_status.name === "in_progress" ||
            update_status.name === "overdue")
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
          await Authentication.findOneAndUpdate(
            { reference_id: current_activity.agency_id },
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
              -referral_data.competition.successful_task_competition.toString(),
            type: "task",
            role: assign_role?.role?.name,
          });
        }

        // Increment completion points if transitioning from pending or overdue to completed
        if (
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "pending" }).lean()
            )._id.toString() &&
            update_status.name === "completed") ||
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "overdue" }).lean()
            )._id.toString() &&
            update_status.name === "completed") ||
          (current_status.toString() ===
            (
              await ActivityStatus.findOne({ name: "in_progress" }).lean()
            )._id.toString() &&
            update_status.name === "completed")
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
          await Authentication.findOneAndUpdate(
            { reference_id: current_activity.agency_id },
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
              +referral_data.competition.successful_task_competition.toString(),
            type: "task",
            role: assign_role?.role?.name,
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
            recurring_end_date: 1,
            assign_to: 1,
            client_id: 1,
          },
        },
      ];

      const getTask = await Activity.aggregate(pipeline);

      const [assign_to_data, client_data] = await Promise.all([
        Authentication.findOne({ reference_id: getTask[0].assign_to }),
        Authentication.findOne({ reference_id: getTask[0].client_id }),
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

      if (getTask[0].activity_type === "task") {
        let data = {
          TaskTitle: "Updated Task status",
          taskName: getTask[0]?.title,
          status: status,
          assign_by: getTask[0]?.assigned_by_name,
          dueDate: moment(getTask[0]?.due_date)?.format("DD/MM/YYYY"),
          dueTime: getTask[0]?.due_time,
          agginTo_email: getTask[0]?.assign_email,
          assignName: getTask[0]?.assigned_to_name,
        };
        const taskMessage = taskTemplate(data);
        await sendEmail({
          email: getTask[0]?.assign_email,
          subject: returnMessage("activity", "UpdateSubject"),
          message: taskMessage,
        });
      } else {
        //   ----------    Notifications start ----------

        const activity_email_template = activityTemplate({
          ...getTask[0],
          activity_type: getTask[0].activity_type,
          meeting_end_time: moment(getTask[0].meeting_end_time).format("HH:mm"),
          meeting_start_time: moment(getTask[0].meeting_start_time).format(
            "HH:mm"
          ),
          recurring_end_date: getTask[0]?.recurring_end_date
            ? getTask[0]?.recurring_end_date.toTimeString().split(" ")[0]
            : null,
          due_date: getTask[0].due_date.toLocaleDateString("en-GB"),
        });
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
      }

      await notificationService.addNotification(
        {
          client_name: client_data.first_name + " " + client_data.last_name,
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          ...getTask[0],
          module_name: "activity",
          activity_type_action: task_status,
          activity_type:
            getTask[0]?.activity_type.name === "others"
              ? "activity"
              : "call meeting",
          meeting_start_time: moment(getTask[0].meeting_start_time).format(
            "HH:mm"
          ),
          due_date: moment(getTask[0].due_date).format("DD-MM-YYYY"),
        },
        id
      );
      //   ----------    Notifications end ----------

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
        "client_id",
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
          .endOf("day");
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
      });

      // --------------- Start--------------------
      const [assign_to_data, client_data] = await Promise.all([
        Authentication.findOne({ reference_id: assign_to }),
        Authentication.findOne({ reference_id: client_id }),
      ]);

      const activity_email_template = activityTemplate({
        ...payload,
        status: mark_as_done ? "completed" : "pending",
        assigned_by_name: user.first_name + " " + user.last_name,
        client_name: client_data.first_name + " " + client_data.last_name,
        assigned_to_name:
          assign_to_data.first_name + " " + assign_to_data.last_name,
      });

      sendEmail({
        email: client_data?.email,
        subject: returnMessage("emailTemplate", "newActivityMeeting"),
        message: activity_email_template,
      });
      sendEmail({
        email: assign_to_data?.email,
        subject: returnMessage("emailTemplate", "newActivityMeeting"),
        message: activity_email_template,
      });
      await notificationService.addNotification(
        {
          assign_by: user.reference_id,
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data.first_name + " " + client_data.last_name,
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          ...payload,
          module_name: "activity",
          activity_type_action: "create_call_meeting",
          activity_type:
            activity_type === "others" ? "activity" : "call meeting",
        },
        newActivity._id
      );
      // ---------------- End ---------------

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
          $unwind: "$client_Data",
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
        { $unwind: "$activity_type" },
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
        "client_id",
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
        recurring_date = moment.utc(payload?.recurring_end_date).endOf("day");
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

      await Activity.findByIdAndUpdate(activity_id, {
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
      });

      // --------------- Start--------------------
      let task_status = "update";
      let emailTempKey = "activityUpdated";
      if (payload.mark_as_done) {
        task_status = "completed";
        emailTempKey = "activityCompleted";
      }

      const [assign_to_data, client_data] = await Promise.all([
        Authentication.findOne({ reference_id: assign_to }),
        Authentication.findOne({ reference_id: client_id }),
      ]);
      const activity_email_template = activityTemplate({
        ...payload,
        status: payload.mark_as_done ? "completed" : "pending",
        assigned_by_name: user.first_name + " " + user.last_name,
        client_name: client_data.first_name + " " + client_data.last_name,
        assigned_to_name:
          assign_to_data.first_name + " " + assign_to_data.last_name,
      });

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
      await notificationService.addNotification(
        {
          assign_by: user.reference_id,
          assigned_by_name: user.first_name + " " + user.last_name,
          client_name: client_data.first_name + " " + client_data.last_name,
          assigned_to_name:
            assign_to_data.first_name + " " + assign_to_data.last_name,
          ...payload,
          module_name: "activity",
          activity_type_action: task_status,
          activity_type:
            activity_type === "others" ? "activity" : "call meeting",
        },
        activity_id
      );
      // ---------------- End ---------------

      return;
    } catch (error) {
      logger.error(`Error while updating call meeting and other: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for to get the activity with date and user based filter
  getActivities = async (payload, user) => {
    try {
      const match_obj = {};

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
        if (payload?.filter?.status === "todo") {
          const [in_progress, pending] = await Promise.all([
            ActivityStatus.findOne({
              name: "in_progress",
            })
              .select("_id")
              .lean(),
            ActivityStatus.findOne({
              name: "pending",
            })
              .select("_id")
              .lean(),
          ]);
          filter["$match"] = {
            ...filter["$match"],
            $or: [
              { activity_status: in_progress?._id },
              { activity_status: pending?._id },
            ],
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
        match_obj["$match"] = {
          is_deleted: false,
          $or: [
            { agency_id: user?.reference_id }, // this is removed because agency can also assign the activity
            { assign_to: user?.reference_id },
          ],
        };
        if (payload?.client_id) {
          match_obj["$match"] = {
            ...match_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_id),
          };
        }
        if (payload?.client_team_id) {
          match_obj["$match"] = {
            ...match_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_team_id),
          };
        }
        if (payload?.team_id) {
          match_obj["$match"] = {
            ...match_obj["$match"],
            assign_to: new mongoose.Types.ObjectId(payload?.team_id),
          };
        }
      } else if (user?.role?.name === "team_agency") {
        match_obj["$match"] = {
          is_deleted: false,
          assign_to: user?.reference_id,
        };
      } else if (user?.role?.name === "client") {
        match_obj["$match"] = {
          is_deleted: false,
          client_id: user?.reference_id,
          agency_id: new mongoose.Types.ObjectId(payload?.agency_id),
        };
        if (payload?.client_team_id) {
          match_obj["$match"] = {
            ...match_obj["$match"],
            client_id: new mongoose.Types.ObjectId(payload?.client_team_id),
          };
        }
      } else if (user?.role?.name === "team_client") {
        match_obj["$match"] = {
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
        { $unwind: "$assign_to" },
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
        { $unwind: "$assign_by" },
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
        { $unwind: "$client_id" },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "activity_status",
            foreignField: "_id",
            as: "activity_status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        { $unwind: "$activity_status" },
        {
          $lookup: {
            from: "activity_type_masters",
            localField: "activity_type",
            foreignField: "_id",
            as: "activity_type",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        { $unwind: "$activity_type" },
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
          };
          activity_array.push(obj);
        });
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
}

module.exports = ActivityService;
