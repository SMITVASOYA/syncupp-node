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
    console.log(payload);
    console.log(id);
    try {
      const with_unread_count = async (notification_data, user_id) => {
        const un_read_count = await Notification.countDocuments({
          user_id: user_id,
          is_read: false,
        });
        console.log(un_read_count);
        return {
          notification: notification_data,
          un_read_count: un_read_count,
        };
      };

      // Activity
      if (module_name === "activity") {
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

        const createAndEmitNotification = async (userId, messageType) => {
          const message = replaceFields(
            returnNotification("activity", messageType, "clientMessage"),
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

        await createAndEmitNotification(client_id, message_type);
        await createAndEmitNotification(assign_to, message_type);
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
        if (activity_type_action === "cancel") message_type = "taskCancelled";
        if (activity_type_action === "inProgress")
          message_type = "taskInProgress";

        const createAndEmitNotification = async (userId, messageType) => {
          const message = replaceFields(
            returnNotification("activity", messageType, "clientMessage"),
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

        await createAndEmitNotification(client_id, message_type);
        await createAndEmitNotification(assign_to, message_type);
      }

      // Agreement

      if (module_name === "agreement") {
        const { action_type, receiver_id, sender_id } = payload;
        console.log(sender_id);
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
        if (action_type === "statusUpdate") message_type = "statusUpdate";

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
