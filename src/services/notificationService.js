const Notification = require("../models/notificationSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnNotification,
  replaceFields,
  extractTextFromHtml,
} = require("../utils/utils");

const { eventEmitter } = require("../socket");
const Admin = require("../models/adminSchema");

class NotificationService {
  // Add Notification
  addNotification = async (payload, id) => {
    let { module_name, activity_type_action, client_id, assign_to, agenda } =
      payload;
    if (payload?.agenda) payload.agenda = extractTextFromHtml(agenda);
    try {
      var with_unread_count = async (notification_data, user_id) => {
        const un_read_count = await Notification.countDocuments({
          user_id: user_id,
          is_read: false,
        });
        return {
          notification: notification_data,
          un_read_count: un_read_count,
        };
      };

      // Activity
      if (module_name === "activity") {
        const { attendees } = payload;
        let message_type;
        if (activity_type_action === "create_call_meeting")
          message_type = "createCallMeeting";
        if (activity_type_action === "update") message_type = "activityUpdated";
        if (activity_type_action === "cancel")
          message_type = "activityCancelled";
        if (activity_type_action === "inProgress")
          message_type = "activityInProgress";
        if (activity_type_action === "completed")
          message_type = "activityCompleted";
        if (activity_type_action === "pending")
          message_type = "activityPending";
        if (activity_type_action === "overdue")
          message_type = "activityOverdue";
        if (activity_type_action === "dueDateAlert")
          message_type = "activityDueDate";
        if (activity_type_action === "meetingAlert")
          message_type = "meetingAlert";

        const createAndEmitNotification = async (
          userId,
          messageType,
          receiver
        ) => {
          console.log(userId, messageType, receiver);

          const message = replaceFields(
            returnNotification("activity", messageType, receiver),
            { ...payload }
          );

          const notification = await Notification.create({
            user_id: userId,
            type: "activity",
            data_reference_id: id,
            message: message,
          });

          eventEmitter(
            "NOTIFICATION",
            await with_unread_count(notification, userId),
            userId
          );
        };

        if (payload?.log_user === "member") {
          if (activity_type_action === "create_call_meeting") {
            console.log("1");
            await createAndEmitNotification(
              payload.agency_id,
              message_type,
              "assignByMessage"
            );
            if (payload.client_id) {
              await createAndEmitNotification(
                payload.client_id,
                message_type,
                "clientMessage"
              );
            }
          }
          if (activity_type_action === "update") {
            await createAndEmitNotification(
              payload.agency_id,
              message_type,
              "assignByMessage"
            );
            if (payload.client_id) {
              await createAndEmitNotification(
                payload.client_id,
                message_type,
                "clientMessage"
              );
            }
          }

          if (
            activity_type_action !== "update" &&
            activity_type_action !== "create_call_meeting"
          ) {
            await createAndEmitNotification(
              client_id,
              message_type,
              "clientMessage"
            );
            await createAndEmitNotification(
              payload.assign_by,
              message_type,
              "assignByMessage"
            );
          }
        } else if (activity_type_action === "meetingAlert") {
          if (payload.client_id) {
            await createAndEmitNotification(
              payload.client_id,
              message_type,
              "alertMessage"
            );
          }

          await createAndEmitNotification(
            payload.assign_by,
            message_type,
            "alertMessage"
          );
          await createAndEmitNotification(
            payload.assign_to,
            message_type,
            "alertMessage"
          );

          attendees &&
            attendees[0] &&
            attendees.map(async (item) => {
              await createAndEmitNotification(
                item,
                message_type,
                "alertMessage"
              );
            });
        } else {
          await createAndEmitNotification(
            client_id,
            message_type,
            "clientMessage"
          );
          await createAndEmitNotification(
            assign_to,
            message_type,
            "assignToMessage"
          );
        }
        if (activity_type_action !== "meetingAlert") {
          attendees &&
            attendees[0] &&
            attendees.map(async (item) => {
              await createAndEmitNotification(
                item,
                message_type,
                "attendeesMessage"
              );
            });
        }
      }

      // Task

      if (module_name === "task") {
        let type = "task";
        let message_type;
        if (activity_type_action === "createTask") message_type = "createTask";
        if (activity_type_action === "completed")
          message_type = "taskCompleted";
        if (activity_type_action === "update") message_type = "taskUpdated";
        if (activity_type_action === "deleted") {
          message_type = "taskDeleted";
          type = "deleted";
        }
        if (activity_type_action === "pending") message_type = "taskPending";

        if (activity_type_action === "cancel") message_type = "taskCancelled";
        if (activity_type_action === "inProgress")
          message_type = "taskInProgress";
        if (activity_type_action === "overdue") message_type = "taskOverdue";

        if (activity_type_action === "dueDateAlert")
          message_type = "taskDueDate";
        const createAndEmitNotification = async (
          userId,
          messageType,
          receiver
        ) => {
          const message = replaceFields(
            returnNotification("activity", messageType, receiver),
            { ...payload }
          );

          const notification = await Notification.create({
            user_id: userId,
            type: type,
            data_reference_id: id,
            message: message,
          });

          eventEmitter(
            "NOTIFICATION",
            await with_unread_count(notification, userId),
            userId
          );
        };

        if (payload?.log_user === "member") {
          if (activity_type_action === "createTask") {
            await createAndEmitNotification(
              payload.agency_id,
              message_type,
              "assignByMessage"
            );

            await createAndEmitNotification(
              payload.assign_to,
              message_type,
              "assignToMessage"
            );
            if (payload.client_id) {
              await createAndEmitNotification(
                payload.client_id,
                message_type,
                "clientMessage"
              );
            }
          }

          if (activity_type_action === "update") {
            await createAndEmitNotification(
              payload.agency_id,
              message_type,
              "assignByMessage"
            );
            if (payload.client_id) {
              await createAndEmitNotification(
                payload.client_id,
                message_type,
                "clientMessage"
              );
            }
          } else {
            await createAndEmitNotification(
              client_id,
              message_type,
              "clientMessage"
            );
            await createAndEmitNotification(
              payload.assign_by,
              message_type,
              "assignByMessage"
            );
          }
        } else {
          await createAndEmitNotification(
            client_id,
            message_type,
            "clientMessage"
          );
          await createAndEmitNotification(
            assign_to,
            message_type,
            "assignToMessage"
          );
        }
      }

      // Agreement

      if (module_name === "agreement") {
        const { action_type, receiver_id, sender_id } = payload;
        let message_type;
        if (action_type === "create") message_type = "create";
        if (action_type === "statusUpdate") message_type = "statusUpdate";

        const createAndEmitNotification = async (userId, messageType) => {
          const message = replaceFields(
            returnNotification("agreement", messageType),
            { ...payload }
          );
          const notification = await Notification.create({
            user_id: userId,
            type: "agreement",
            data_reference_id: id,
            message: message,
          });

          eventEmitter(
            "NOTIFICATION",
            await with_unread_count(notification, userId),
            userId
          );
        };
        if (action_type === "create")
          await createAndEmitNotification(receiver_id, message_type);
        if (action_type === "statusUpdate")
          await createAndEmitNotification(sender_id, message_type);
      }

      // Invoice

      if (module_name === "invoice") {
        const { action_type, receiver_id, sender_id } = payload;
        let message_type;
        if (action_type === "create") message_type = "create";
        if (action_type === "updateStatusUnpaid") message_type = "create";
        if (action_type === "overdue") message_type = "invoiceDue";
        if (action_type === "updateStatusPaid") message_type = "invoicePaid";

        const createAndEmitNotification = async (userId, messageType) => {
          const message = replaceFields(
            returnNotification("invoice", messageType),
            { ...payload }
          );
          const notification = await Notification.create({
            user_id: userId,
            type: "invoice",
            data_reference_id: id,
            message: message,
          });

          eventEmitter(
            "NOTIFICATION",
            await with_unread_count(notification, userId),
            userId
          );
        };
        await createAndEmitNotification(receiver_id, message_type);
      }

      const createAndEmitNotification = async (
        userId,
        messageType,
        messageKey,
        dataType
      ) => {
        const message = replaceFields(
          returnNotification(messageKey, messageType),
          { ...payload }
        );
        const notification = await Notification.create({
          user_id: userId,
          type: dataType,
          data_reference_id: id,
          message: message,
        });

        eventEmitter(
          "NOTIFICATION",
          await with_unread_count(notification, userId),
          userId
        );
      };

      if (module_name === "general") {
        const { action_name } = payload;
        //  Add team member by client
        if (action_name === "agencyAdded") {
          await createAndEmitNotification(
            payload.receiver_id,
            "clientTeamMemberAdded",
            "general",
            "general"
          );
        }
        // client Team member password set by agency

        if (action_name === "teamClientPaymentDone") {
          await createAndEmitNotification(
            payload.receiver_id,
            "clientTeamJoined",
            "general",
            "general"
          );
        }

        //  client Member payment done

        if (action_name === "memberPaymentDone") {
          await createAndEmitNotification(
            payload.receiver_id,
            "clientTeamPaymentDone",
            "general",
            "general"
          );
        }

        // client  Member payment Fail

        if (action_name === "memberPaymentFail") {
          await createAndEmitNotification(
            payload.receiver_id,
            "clientTeamPaymentFail",
            "general",
            "general"
          );
        }

        // cMember deleted by client

        if (action_name === "memberDeleted") {
          await createAndEmitNotification(
            payload.receiver_id,
            "memberDeletedClient",
            "general",
            "deleted"
          );
        }

        // cMember deleted by agency

        if (action_name === "memberDeletedAgency") {
          await createAndEmitNotification(
            payload.receiver_id,
            "memberDeletedAgency",
            "general",
            "deleted"
          );
        }
      }

      // referral Points

      if (module_name === "referral") {
        console.log(payload.action_type, "fsgg");
        console.log(payload, "gegege");
        if (payload.action_type === "login") {
          await createAndEmitNotification(
            payload.receiver_id,
            "login",
            "referral",
            "referral"
          );
        }
        if (payload.action_type === "signUp") {
          await createAndEmitNotification(
            payload.receiver_id,
            "signUp",
            "referral",
            "referral"
          );
        }
        let message_type;
        if (payload.action_type === "taskDeduct") message_type = "taskDeduct";
        if (payload.action_type === "taskAdded") message_type = "taskAdded";
        if (
          payload.action_type === "taskDeduct" ||
          payload.action_type === "taskAdded"
        ) {
          console.log("first");
          await createAndEmitNotification(
            payload.receiver_id,
            message_type,
            "referral",
            "referral"
          );
        }
      }

      return;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Admin Notification
  addAdminNotification = async (payload, id) => {
    console.log(payload);
    try {
      const with_unread_count = async (notification_data, user_id) => {
        const un_read_count = await Notification.countDocuments({
          user_id: user_id,
          is_read: false,
        });
        return {
          notification: notification_data,
          un_read_count: un_read_count,
        };
      };

      const admin = await Admin.findOne({});
      let { action_name } = payload;
      const createAndEmitNotification = async (
        userId,
        messageType,
        messageKey,
        dataType
      ) => {
        const message = replaceFields(
          returnNotification(messageKey, messageType),
          { ...payload }
        );
        const notification = await Notification.create({
          user_id: userId,
          type: dataType,
          data_reference_id: id,
          message: message,
        });

        eventEmitter(
          "NOTIFICATION",
          await with_unread_count(notification, userId),
          userId
        );
      };

      //  Add team member by client
      if (action_name === "agencyCreated") {
        await createAndEmitNotification(
          admin._id,
          "agencyCreated",
          "admin",
          "agency"
        );
      }

      //  seat remover
      if (action_name === "seatRemoved") {
        console.log(payload);
        if (payload.user_type === "client") {
          await createAndEmitNotification(
            admin._id,
            "clientSeatRemoved",
            "admin",
            "deleted"
          );
        } else if (payload.user_type === "Team Agency") {
          await createAndEmitNotification(
            admin._id,
            "teamAgencySeatRemoved",
            "admin",
            "deleted"
          );
        } else if (payload.user_type === "Team Client") {
          await createAndEmitNotification(
            admin._id,
            "teamClientSeatRemoved",
            "admin",
            "deleted"
          );
        }
      }

      return;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Get Notifications
  getNotification = async (user, searchObj) => {
    try {
      if (user?.role?.name === undefined) {
        const { skip, limit } = searchObj;
        const notifications = await Notification.find({
          user_id: user._id,
        })
          .sort({ createdAt: -1, is_read: -1 })
          .skip(skip)
          .limit(limit);
        const un_read_count = await Notification.find({
          user_id: user._id,
          is_read: false,
        }).countDocuments();
        return {
          notificationList: notifications,
          un_read_count: un_read_count,
        };
      } else {
        const { skip, limit } = searchObj;
        const notifications = await Notification.find({
          user_id: user.reference_id,
        })
          .sort({ createdAt: -1, is_read: -1 })
          .skip(skip)
          .limit(limit);
        const un_read_count = await Notification.find({
          user_id: user.reference_id,
          is_read: false,
        }).countDocuments();
        return {
          notificationList: notifications,
          un_read_count: un_read_count,
        };
      }
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Read Notifications
  readNotification = async (payload, user) => {
    try {
      const { notification_id } = payload;

      if (user?.role?.name === undefined) {
        if (notification_id === "all") {
          await Notification.updateMany(
            {
              user_id: user._id,
            },
            {
              is_read: true,
            },
            { new: true }
          );
        } else {
          await Notification.findOneAndUpdate(
            {
              _id: notification_id,
              user_id: user._id,
            },
            {
              is_read: true,
            },
            { new: true, useFindAndModify: false }
          );
        }
      } else {
        if (notification_id === "all") {
          await Notification.updateMany(
            {
              user_id: user.reference_id,
            },
            {
              is_read: true,
            },
            { new: true }
          );
        } else {
          await Notification.findOneAndUpdate(
            {
              _id: notification_id,
              user_id: user.reference_id,
            },
            {
              is_read: true,
            },
            { new: true, useFindAndModify: false }
          );
        }
      }

      return;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = NotificationService;
