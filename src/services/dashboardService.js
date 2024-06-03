const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const Activity = require("../models/activitySchema");
const moment = require("moment");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Client = require("../models/teamClientSchema");
const mongoose = require("mongoose");
const Task = require("../models/taskSchema");
const { capitalizeFirstLetter } = require("../utils/utils");
const Section = require("../models/sectionSchema");

// Register Agency
class dashboardService {
  // Dashboard data

  dashboardData = async (user) => {
    try {
      const currentDate = moment().utc();
      const startOfToday = moment(currentDate).startOf("day").utc();
      const endOfToday = moment(currentDate).endOf("day").utc();

      const workspaceId = new mongoose.Types.ObjectId(user?.workspace);
      const userId = new mongoose.Types.ObjectId(user?._id);

      let is_admin;
      if (user?.role === "agency") is_admin = true;
      else if (user?.role === "team_agency" && user?.sub_role === "team_member")
        is_admin = false;
      else if (user?.role === "team_agency" && user?.sub_role === "admin")
        is_admin = true;
      else if (user?.role === "client") is_admin = false;
      else if (user?.role === "team_client") is_admin = false;

      const assign_to_data = !is_admin ? { assign_to: userId } : {};
      const todays_call_meeting = !is_admin ? { attendees: userId } : {};
      const invoice_client =
        user?.role === "client" ? { client_id: userId } : {};
      const agreement_receiver =
        user?.role === "client" ? { receiver: userId } : {};

      // Task Counts
      const taskPromises = await Task.aggregate([
        {
          $match: {
            workspace_id: workspaceId,
            is_deleted: false,
            ...assign_to_data,
          },
        },
        {
          $lookup: {
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "tasks",
          },
        },
        {
          $unwind: { path: "$tasks", preserveNullAndEmptyArrays: true },
        },
        {
          $project: {
            data: "$tasks",
          },
        },
      ]);

      const totalTaskCount = taskPromises.length;

      const overdueTaskCount = taskPromises.filter(
        (task) => task?.data?.key === "overdue"
      ).length;
      const completedTaskCount = taskPromises.filter(
        (task) => task?.data?.key === "completed"
      ).length;

      // Invoice Counts

      if (
        user?.role === "agency" ||
        user?.role === "client" ||
        user?.sub_role === "admin"
      ) {
        const InvoiceData = await Invoice.aggregate([
          {
            $lookup: {
              from: "invoice_status_masters",
              localField: "status",
              foreignField: "_id",
              as: "invoiceStatus",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$invoiceStatus",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              workspace_id: workspaceId,
              is_deleted: false,
              ...invoice_client,
            },
          },
          {
            $project: {
              data: "$invoiceStatus",
            },
          },
        ]);

        var overdueInvoiceCount = InvoiceData.filter(
          (invoice) => invoice?.data?.name === "overdue"
        ).length;
        var invoiceSentCount = InvoiceData.filter(
          (invoice) => invoice?.data?.name === "unpaid"
        ).length;
      }
      if (
        user?.role === "agency" ||
        user?.role === "client" ||
        user?.sub_role === "admin"
      ) {
        // Members Count
        const membersData = await Workspace.aggregate([
          { $match: { _id: workspaceId } },
          { $unwind: { path: "$members", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "authentications",
              localField: "members.user_id",
              foreignField: "_id",
              as: "user_details",
            },
          },
          {
            $unwind: {
              path: "$user_details",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "role_masters",
              localField: "members.role",
              foreignField: "_id",
              as: "status",
            },
          },
          { $unwind: { path: "$status", preserveNullAndEmptyArrays: true } },
          {
            $match: {
              "members.status": "confirmed",
              "user_details.is_deleted": false,
            },
          },
          {
            $project: {
              status: "$status",
            },
          },
        ]);

        if (user?.role === "agency" || user?.sub_role === "admin") {
          var clientCount = membersData.filter(
            (member) => member?.status?.name === "client"
          ).length;

          var teamMemberCount = membersData.filter(
            (member) => member?.status?.name === "team_agency"
          ).length;
        }
        if (user?.role === "client") {
          var teamMemberCount = membersData.filter(
            (member) => member?.status?.name === "team_client"
          ).length;
        }
      }

      // Call meeting aggregations
      const todaysCallMeeting = await Activity.aggregate([
        {
          $match: {
            is_deleted: false,
            workspace_id: workspaceId,
            meeting_date: {
              $gte: startOfToday.toDate(),
              $lte: endOfToday.toDate(),
            },
            ...todays_call_meeting,
          },
        },
        {
          $count: "todaysCallMeeting",
        },
      ]);

      // Agreement aggregations
      if (
        user?.role === "agency" ||
        user?.role === "client" ||
        user?.sub_role === "admin"
      ) {
        var agreementPendingCount = await Agreement.aggregate([
          {
            $match: {
              workspace_id: workspaceId,
              status: "sent",
              is_deleted: false,
              ...agreement_receiver,
            },
          },
          {
            $count: "agreementPendingCount",
          },
        ]);
      }

      const commonFields = {
        task_count: totalTaskCount ?? 0,
        overdueTaskCount: overdueTaskCount ?? 0,
        completed_task_count: completedTaskCount ?? 0,
        todays_call_meeting: todaysCallMeeting[0]?.todaysCallMeeting ?? 0,
      };

      if (user?.role === "agency") {
        return {
          ...commonFields,
          client_count: clientCount ?? 0,
          team_member_count: teamMemberCount ?? 0,
          invoice_overdue_count: overdueInvoiceCount ?? 0,
          invoice_sent_count: invoiceSentCount ?? 0,
          agreement_pending_count:
            agreementPendingCount[0]?.agreementPendingCount ?? 0,
        };
      } else if (user?.role === "client") {
        return {
          ...commonFields,
          team_member_count: teamMemberCount ?? 0,
          invoice_overdue_count: overdueInvoiceCount ?? 0,
          invoice_sent_count: invoiceSentCount ?? 0,
          agreement_pending_count:
            agreementPendingCount[0]?.agreementPendingCount ?? 0,
        };
      } else if (user?.role === "team_client") {
        return commonFields;
      } else if (
        user?.role === "team_agency" &&
        user?.sub_role === "team_member"
      ) {
        return commonFields;
      } else if (user?.role === "team_agency" && user?.sub_role === "admin") {
        return {
          ...commonFields,
          client_count: clientCount ?? 0,
          team_member_count: teamMemberCount ?? 0,
          invoice_overdue_count: overdueInvoiceCount ?? 0,
          invoice_sent_count: invoiceSentCount ?? 0,
          agreement_pending_count:
            agreementPendingCount[0]?.agreementPendingCount ?? 0,
        };
      }
    } catch (error) {
      logger.error(`Error while fetching dashboard data for agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  todayTask = async (user) => {
    try {
      let is_admin;
      if (user?.role === "agency") is_admin = false;
      if (user?.role === "client") is_admin = false;
      if (user?.role === "team_client") is_admin = false;
      if (user?.role === "team_agency") {
        if (user?.sub_role === "team_member") {
          is_admin = false;
        }
        if (user?.sub_role === "admin") {
          is_admin = true;
        }
      }

      const workspaceId = new mongoose.Types.ObjectId(user?.workspace);
      const userId = new mongoose.Types.ObjectId(user?._id);

      const startOfToday = moment.utc().startOf("day").utc();
      const endOfToday = moment.utc().endOf("day").utc();

      const [todaysTasks] = await Promise.all([
        Task.aggregate([
          {
            $match: {
              workspace_id: workspaceId,
              is_deleted: false,
              ...(is_admin && { assign_to: userId }),
              due_date: {
                $gte: startOfToday.toDate(),
                $lte: endOfToday.toDate(),
              },
            },
          },
          {
            $lookup: {
              from: "sections",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { section_name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $project: {
              _id: 1,
              title: 1,
              due_date: 1,
              due_time: 1,
              assign_by: 1,
              activity_status: "$statusName.section_name",
              createdAt: 1,
            },
          },
          {
            $limit: 5,
          },
        ]),
      ]);
      return todaysTasks;
    } catch (error) {
      logger.error(`Error while fetch todays task: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Completed task
  completedTask = async (user) => {
    try {
      let is_admin;
      if (user?.role === "agency") is_admin = false;
      if (user?.role === "client") is_admin = false;
      if (user?.role === "team_client") is_admin = false;
      if (user?.role === "team_agency") {
        if (user?.sub_role === "team_member") {
          is_admin = false;
        }
        if (user?.sub_role === "admin") {
          is_admin = true;
        }
      }

      const workspaceId = new mongoose.Types.ObjectId(user?.workspace);
      const userId = new mongoose.Types.ObjectId(user?._id);
      const completed_task_ids = await Section.distinct("_id", {
        workspace_id: workspaceId,
        key: "completed",
      });

      const [completedTasks] = await Promise.all([
        Task.aggregate([
          {
            $match: {
              workspace_id: workspaceId,
              is_deleted: false,
              ...(is_admin && { assign_to: userId }),
              activity_status: { $in: completed_task_ids },
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              due_date: 1,
              due_time: 1,
              assign_by: 1,
              activity_status: 1,
              createdAt: 1,
            },
          },
          {
            $limit: 5,
          },
          {
            $sort: { createdAt: -1 },
          },
        ]),
      ]);
      return completedTasks;
    } catch (error) {
      logger.error(`Error while fetch todays task: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Overdue task
  overdueTask = async (user) => {
    try {
      let search_id;
      let admin_id;
      if (user.role.name === "agency") search_id = "agency_id";
      if (user.role.name === "client") search_id = "client_id";
      if (user.role.name === "team_client") {
        const memberRole = await Team_Client.findOne({
          _id: user.reference_id,
        }).lean();
        search_id = "client_id";
        admin_id = memberRole.client_id;
      }
      if (user.role.name === "team_agency") {
        const memberRole = await Team_Agency.findOne({ _id: user.reference_id })
          .populate("role")
          .lean();
        if (memberRole.role.name === "team_member") {
          search_id = "assign_to";
        }
        if (memberRole.role.name === "admin") {
          search_id = "agency_id";
          user.reference_id = memberRole?.agency_id;
          admin_id = memberRole.agency_id;
        }
      }

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
              [search_id]: user.reference_id,
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

  // // Agency Affiliate statics
  // agencyAffiliate = async (user) => {
  //   try {
  //     const currentDate = moment();
  //     const startOfPreviousMonth = moment(currentDate)
  //       .subtract(1, "months")
  //       .startOf("month");
  //     const endOfPreviousMonth = moment(currentDate)
  //       .subtract(1, "months")
  //       .endOf("month");

  //     const commissionPercentage = await Configuration.findOne({});
  //     const [
  //       agencyAffiliate,
  //       activeReferralCount,
  //       agencyClickCount,
  //       lastMonthEarning,
  //     ] = await Promise.all([
  //       ReferralHistory.countDocuments({ referred_by: user._id }),

  //       ReferralHistory.aggregate([
  //         {
  //           $lookup: {
  //             from: "authentications",
  //             localField: "referred_to",
  //             foreignField: "_id",
  //             as: "agencyData",
  //             pipeline: [
  //               {
  //                 $project: {
  //                   status: 1,
  //                 },
  //               },
  //             ],
  //           },
  //         },
  //         {
  //           $unwind: {
  //             path: "$agencyData",
  //             preserveNullAndEmptyArrays: true,
  //           },
  //         },
  //         {
  //           $match: {
  //             referred_by: user._id,
  //             "agencyData.status": "confirmed",
  //           },
  //         },

  //         {
  //           $count: "agencyAffiliate",
  //         },
  //       ]),
  //       Authentication.findById(user._id).lean(),
  //       ReferralHistory.aggregate([
  //         {
  //           $match: {
  //             referred_by: user.reference_id,
  //           },
  //         },

  //         {
  //           $lookup: {
  //             from: "payment_histories",
  //             localField: "referred_to",
  //             foreignField: "agency_id",
  //             as: "paymentData",
  //           },
  //         },
  //         {
  //           $unwind: {
  //             path: "$paymentData",
  //             preserveNullAndEmptyArrays: true,
  //           },
  //         },
  //         {
  //           $match: {
  //             "paymentData.createdAt": {
  //               $gte: startOfPreviousMonth.toDate(),
  //               $lte: endOfPreviousMonth.toDate(),
  //             },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: null,
  //             totalAmount: { $sum: "$paymentData.amount" },
  //           },
  //         },
  //         {
  //           $project: {
  //             _id: 0,
  //             totalAmount: 1,
  //             total: {
  //               $multiply: [
  //                 "$totalAmount",
  //                 commissionPercentage.referral.commission_percentage / 100,
  //               ],
  //             },
  //           },
  //         },
  //       ]),
  //     ]);
  //     return {
  //       referral_count: agencyAffiliate ?? 0,
  //       active_referral_count: activeReferralCount[0]?.agencyAffiliate ?? 0,
  //       agency_click_count: agencyClickCount?.click_count ?? 0,
  //       last_month_earning: lastMonthEarning[0]?.total ?? 0,
  //     };
  //   } catch (error) {
  //     logger.error(`Error while fetch Agency affiliate data task: ${error}`);
  //     return throwError(error?.message, error?.statusCode);
  //   }
  // };
}

module.exports = dashboardService;
