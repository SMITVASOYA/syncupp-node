const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const Activity = require("../models/activitySchema");
const moment = require("moment");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Client = require("../models/teamClientSchema");

// Register Agency
class dashboardService {
  // Todays task

  todayTask = async (user) => {
    let search_id;
    let admin_id;

    if (user.role.name === "agency") search_id = "agency_id";
    if (user.role.name === "client") search_id = "client_id";
    if (user.role.name === "team_client") {
      const memberRole = await Team_Client.findOne({
        _id: user.reference_id,
      });
      search_id = "client_id";
      admin_id = memberRole.client_id;
    }
    if (user.role.name === "team_agency") {
      const memberRole = await Team_Agency.findOne({
        _id: user.reference_id,
      }).populate("role");
      if (memberRole.role.name === "team_member") {
        search_id = "assign_to";
      }
      if (memberRole.role.name === "admin") {
        search_id = "agency_id";
        admin_id = memberRole.agency_id;
      }
    }
    try {
      const currentDate = moment();
      const startOfToday = moment(currentDate).startOf("day");
      const endOfToday = moment(currentDate).endOf("day");

      const [todaysTasks] = await Promise.all([
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
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
            $unwind: {
              path: "$activity_type",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "authentications",
              localField: "assign_to",
              foreignField: "reference_id",
              as: "assign_to_name",
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
            $unwind: {
              path: "$assign_to_name",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "authentications",
              localField: "client_id",
              foreignField: "reference_id",
              as: "client_name",
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
            $unwind: {
              path: "$client_name",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              "statusName.name": { $ne: "cancel" }, // Fix: Change $nq to $ne
              "activity_type.name": "task", // Fix: Change $nq to $ne
              is_deleted: false,
              due_date: {
                $gte: startOfToday.toDate(),
                $lte: endOfToday.toDate(),
              },
            },
          },
          {
            $project: {
              _id: 1,
              activity_type: "$activity_type.name",
              title: 1,
              due_date: 1,
              due_time: 1,
              client_id: 1,
              client_name: "$client_name.assigned_to_name",
              assign_to: "$assign_to_name.assigned_to_name",
              assign_by: 1,
              agency_id: 1,
              activity_status: "$statusName.name",
              createdAt: 1,
            },
          },
        ]),
      ]);
      return todaysTasks;
    } catch (error) {
      logger.error(`Error while fetch todays task: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Overdue task
  overdueTask = async (user) => {
    let search_id;
    let admin_id;
    if (user.role.name === "agency") search_id = "agency_id";
    if (user.role.name === "client") search_id = "client_id";
    if (user.role.name === "team_client") {
      const memberRole = await Team_Client.findOne({
        _id: user.reference_id,
      });
      search_id = "client_id";
      admin_id = memberRole.client_id;
    }
    if (user.role.name === "team_agency") {
      const memberRole = await Team_Agency.findOne({
        _id: user.reference_id,
      }).populate("role");
      if (memberRole.role.name === "team_member") {
        search_id = "assign_to";
      }
      if (memberRole.role.name === "admin") {
        search_id = "agency_id";
        admin_id = memberRole.agency_id;
      }
    }
    try {
      const [overdueTask] = await Promise.all([
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
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
            $unwind: {
              path: "$activity_type",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "authentications",
              localField: "assign_to",
              foreignField: "reference_id",
              as: "assign_to_name",
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
            $unwind: {
              path: "$assign_to_name",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "authentications",
              localField: "client_id",
              foreignField: "reference_id",
              as: "client_name",
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
            $unwind: {
              path: "$client_name",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              "statusName.name": { $eq: "overdue" },
              "activity_type.name": "task",
              is_deleted: false,
            },
          },
          {
            $project: {
              _id: 1,
              activity_type: "$activity_type.name",
              title: 1,
              due_date: 1,
              due_time: 1,
              client_id: 1,
              client_name: "$client_name.assigned_to_name",
              assign_to: "$assign_to_name.assigned_to_name",
              assign_by: 1,
              agency_id: 1,
              activity_status: "$statusName.name",
              createdAt: 1,
            },
          },
        ]),
      ]);
      return overdueTask;
    } catch (error) {
      logger.error(`Error while fetch Overdue task: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = dashboardService;
