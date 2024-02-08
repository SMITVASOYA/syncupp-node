const Activity = require("../models/activitySchema");
const ActivityStatus = require("../models/masters/activityStatusMasterSchema");
const ActivityType = require("../models/masters/activityTypeMasterSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  paginationObject,
  getKeywordType,
} = require("../utils/utils");
const moment = require("moment");
const { default: mongoose } = require("mongoose");
const { ObjectId } = require("mongodb");
const Team_Agency = require("../models/teamAgencySchema");
class ActivityService {
  createTask = async (payload, id) => {
    try {
      const {
        title,
        internal_info,
        due_date,
        // due_time,
        assign_to,
        client_id,
        mark_as_done,
      } = payload;

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
        internal_info,
        due_date: dueDateObject.toDate(),
        due_time: timeOnly,
        assign_to,
        assign_by: id,
        client_id,
        activity_status: status._id,
        activity_type: type._id,
      });
      return newTask.save();
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
    if (!searchObj.pagination) {
      try {
        const queryObj = { is_deleted: false };
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
              client_name: {
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
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              foreignField: "_id",
              as: "assign_by",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              internal_info: 1,
              assigned_to_name: "$team_Data.name",
              assigned_by_name: "$assign_by.name",
              assigned_by_first_name: "$assign_by.first_name",
              assigned_by_last_name: "$assign_by.last_name",
              assigned_by_name: {
                $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
              },
              client_name: "$client_Data.name",
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
    } else {
      try {
        const queryObj = { is_deleted: false };
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
              client_name: {
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
        // const teamRole = await Team_Agency.findOne({
        //   _id: user.reference_id,
        // }).populate("role");

        // let assignedByNameProjection = "$assign_by.name";
        // if (teamRole?.role?.name === "admin") {
        //   assignedByNameProjection = {
        //     $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
        //   };
        // } else if (teamRole?.role?.name === "team_member") {
        //   assignedByNameProjection = "$assign_by.name";
        // } else {
        //   assignedByNameProjection = {
        //     $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
        //   };
        // }
        const taskPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "client_id",
              foreignField: "reference_id",
              as: "client_Data",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              foreignField: "_id",
              as: "assign_by",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              internal_info: 1,
              assigned_to_name: "$team_Data.name",
              assigned_by_name: "$assign_by.name",
              assigned_by_first_name: "$assign_by.first_name",
              assigned_by_last_name: "$assign_by.last_name",
              assigned_by_name: {
                $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
              },
              client_name: "$client_Data.name",
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
    }
  };

  clientTaskList = async (searchObj, user) => {
    if (!searchObj.pagination) {
      try {
        const queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
        };
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
              "client_Data.name": {
                $regex: searchObj.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_Data.first_name": {
                $regex: searchObj.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_Data.last_name": {
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
            $match: queryObj,
          },
          {
            $lookup: {
              from: "authentications",
              localField: "client_id",
              foreignField: "reference_id",
              as: "client_Data",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              foreignField: "_id",
              as: "assign_by",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
            $project: {
              title: 1,
              client_id: 1,
              status: "$status.name",
              due_time: 1,
              due_date: 1,
              createdAt: 1,
              client_name: "$client_Data.name",

              internal_info: 1,
              assigned_to_name: "$team_Data.name",

              assigned_by_name: "$assign_by.name",
              assigned_by_first_name: "$assign_by.first_name",
              assigned_by_last_name: "$assign_by.last_name",
              assigned_by_name: {
                $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
              },
              assign_to_name: {
                $concat: ["$team_Data.first_name", " ", "$team_Data.last_name"],
              },
              client_name: "$client_Data.name",

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
    } else {
      try {
        const queryObj = {
          is_deleted: false,
          client_id: user.reference_id,
        };
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
              "client_Data.name": {
                $regex: searchObj.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_Data.first_name": {
                $regex: searchObj.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              "client_Data.last_name": {
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
            $match: queryObj,
          },
          {
            $lookup: {
              from: "authentications",
              localField: "client_id",
              foreignField: "reference_id",
              as: "client_Data",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              foreignField: "_id",
              as: "assign_by",
              pipeline: [
                { $project: { name: 1, first_name: 1, last_name: 1 } },
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
            $project: {
              title: 1,
              client_id: 1,
              status: "$status.name",
              due_time: 1,
              due_date: 1,
              createdAt: 1,
              client_name: "$client_Data.name",
              internal_info: 1,
              assigned_to_name: "$team_Data.name",
              assigned_by_name: "$assign_by.name",
              assigned_by_first_name: "$assign_by.first_name",
              assigned_by_last_name: "$assign_by.last_name",
              assigned_by_name: {
                $concat: ["$assign_by.first_name", " ", "$assign_by.last_name"],
              },
              assign_to_name: {
                $concat: ["$team_Data.first_name", " ", "$team_Data.last_name"],
              },

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
    }
  };

  teamAdminTaskList = async (searchObj, user) => {
    if (!searchObj.pagination) {
      try {
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");

        if (teamRole?.role?.name === "admin") {
          const queryObj = {
            is_deleted: false,
            assign_by: user.reference_id,
          };
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
                "client_Data.name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.first_name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.last_name": {
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
                "team_by.last_name": {
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
              $match: queryObj,
            },
            {
              $lookup: {
                from: "authentications",
                localField: "client_id",
                foreignField: "reference_id",
                as: "client_Data",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                foreignField: "_id",
                as: "team_by",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              $project: {
                contact_number: 1,
                title: 1,
                client_id: 1,
                status: "$status.name",
                due_time: 1,
                due_date: 1,
                createdAt: 1,
                client_name: "$client_Data.name",

                internal_info: 1,
                assigned_to_name: "$team_Data.name",
                assigned_to_first_name: "$team_Data.first_name",
                assigned_to_last_name: "$team_Data.last_name",
                assigned_by_name: "$team_by.name",
                assign_by: 1,
                assigned_by_first_name: "$team_by.first_name",
                assigned_by_last_name: "$team_by.last_name",
                assigned_by_name: {
                  $concat: [
                    "$assign_by.first_name",
                    " ",
                    "$assign_by.last_name",
                  ],
                },

                column_id: "$status.name",
              },
            },
          ];
          const activity = await Activity.aggregate(taskPipeline).sort({
            createdAt: -1,
          });
          // .sort(pagination.sort)
          // .skip(pagination.skip)
          // .limit(pagination.result_per_page);

          const totalAgreementsCount = await Activity.countDocuments(queryObj);

          // Calculating total pages
          const pages = Math.ceil(
            totalAgreementsCount / pagination.result_per_page
          );

          return {
            activity,
          };
        } else if (teamRole.role.name === "team_member") {
          const queryObj = {
            is_deleted: false,
            assign_to: user.reference_id,
          };
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
                "client_Data.name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.first_name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.last_name": {
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
              $match: queryObj,
            },
            {
              $lookup: {
                from: "authentications",
                localField: "client_id",
                foreignField: "reference_id",
                as: "client_Data",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                foreignField: "_id",
                as: "team_by",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              $project: {
                contact_number: 1,
                title: 1,
                client_id: 1,
                status: "$status.name",
                due_time: 1,
                due_date: 1,
                createdAt: 1,
                client_name: "$client_Data.name",
                internal_info: 1,
                assigned_to_name: "$team_Data.name",
                assigned_by_name: "$team_by.name",
                assign_by: 1,
                assigned_by_first_name: "$team_by.first_name",
                assigned_by_last_name: "$team_by.last_name",
                assigned_by_name: {
                  $concat: [
                    "$assign_by.first_name",
                    " ",
                    "$assign_by.last_name",
                  ],
                },

                column_id: "$status.name",
              },
            },
          ];
          const activity = await Activity.aggregate(taskPipeline).sort({
            createdAt: -1,
          });
          // .sort(pagination.sort)
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
        }
      } catch (error) {
        logger.error(`Error while fetch list : ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    } else {
      try {
        const teamRole = await Team_Agency.findOne({
          _id: user.reference_id,
        }).populate("role");

        if (teamRole?.role?.name === "admin") {
          const queryObj = {
            $or: [
              { assign_by: user.reference_id },
              { assign_to: user.reference_id },
            ],
            is_deleted: false,
          };
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
                "client_Data.name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.first_name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.last_name": {
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
                "team_by.last_name": {
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
              $match: queryObj,
            },
            {
              $lookup: {
                from: "authentications",
                localField: "client_id",
                foreignField: "reference_id",
                as: "client_Data",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                foreignField: "_id",
                as: "team_by",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              $project: {
                contact_number: 1,
                title: 1,
                client_id: 1,
                status: "$status.name",
                due_time: 1,
                due_date: 1,
                createdAt: 1,
                client_name: "$client_Data.name",

                internal_info: 1,
                assigned_to_name: "$team_Data.name",

                assigned_by_name: "$team_by.name",
                assign_by: 1,
                assigned_by_first_name: "$team_by.first_name",
                assigned_by_last_name: "$team_by.last_name",
                assigned_by_name: {
                  $concat: ["$team_by.first_name", " ", "$team_by.last_name"],
                },

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
            team_member_role: teamRole?.role?.name,
          };
        } else if (teamRole.role.name === "team_member") {
          const queryObj = {
            is_deleted: false,
            assign_to: user.reference_id,
          };
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
                "client_Data.name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.first_name": {
                  $regex: searchObj.search.toLowerCase(),
                  $options: "i",
                },
              },
              {
                "client_Data.last_name": {
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
              $match: queryObj,
            },
            {
              $lookup: {
                from: "authentications",
                localField: "client_id",
                foreignField: "reference_id",
                as: "client_Data",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
                foreignField: "_id",
                as: "team_by",
                pipeline: [
                  { $project: { name: 1, first_name: 1, last_name: 1 } },
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
              $project: {
                contact_number: 1,
                title: 1,
                client_id: 1,
                status: "$status.name",
                due_time: 1,
                due_date: 1,
                createdAt: 1,
                client_name: "$client_Data.name",

                internal_info: 1,
                assigned_to_name: "$team_Data.name",

                assigned_by_name: "$team_by.name",
                assign_by: 1,
                assigned_by_first_name: "$team_by.first_name",
                assigned_by_last_name: "$team_by.last_name",
                assigned_by_name: {
                  $concat: ["$team_by.first_name", " ", "$team_by.last_name"],
                },

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
            team_member_role: teamRole?.role?.name,
          };
        }
      } catch (error) {
        logger.error(`Error while fetch list : ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
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
            foreignField: "_id",
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
            internal_info: 1,
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
            assign_to_name: {
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
      const deletedTask = await Activity.updateMany(
        { _id: { $in: taskIdsToDelete } },
        { $set: { is_deleted: true } }
      );
      return deletedTask;
    } catch (error) {
      logger.error(`Error while Deleting task, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  updateTask = async (payload, id) => {
    try {
      const {
        title,
        internal_info,
        due_date,
        assign_to,
        client_id,
        mark_as_done,
      } = payload;

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
          internal_info,
          due_date: dueDateObject.toDate(),
          due_time: timeOnly,
          assign_to,
          client_id,
          activity_status: status._id,
        },
        { new: true, useFindAndModify: false }
      );
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
      return updateTasks;
    } catch (error) {
      logger.error(`Error while Updating status, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ActivityService;
