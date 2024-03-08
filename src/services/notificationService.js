const Notification = require("../models/notificationSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnNotification,
  replaceFields,
  extractTextFromHtml,
} = require("../utils/utils");

const { eventEmitter } = require("../socket");

class NotificationService {
  // Add Notification
  addNotification = async (payload, id) => {
    let { module_name, activity_type_action, client_id, assign_to, agenda } =
      payload;

    if (payload.agenda) payload.agenda = extractTextFromHtml(agenda);
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
      return { notificationList: notifications, un_read_count: un_read_count };
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Read Notifications

  readNotification = async (payload, user) => {
    try {
      const { notification_id } = payload;
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

      return;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = NotificationService;
