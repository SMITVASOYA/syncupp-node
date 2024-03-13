const { throwError } = require("../helpers/errorUtil");
const logger = require("../logger");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Client = require("../models/teamClientSchema");
const {
  returnMessage,
  returnNotification,
  capitalizeFirstLetter,
} = require("../utils/utils");
const Group_Chat = require("../models/groupChatSchema");
const { emitEvent, eventEmitter } = require("../socket.js");
const Notification = require("../models/notificationSchema.js");
const Chat = require("../models/chatSchema.js");

class GroupChatService {
  // this function is used to fetch the users list to create the group
  // Agency can create Group with Client and Agency Team member
  // Client can create Group with Agency and Client Team member
  // Agency can create Group internally with Agency Team member
  // Client can create Group internally with Client Team member

  usersList = async (user) => {
    try {
      let member_ids;
      if (user?.role?.name === "agency") {
        const [clients, agency_teams] = await Promise.all([
          Client.distinct("_id", {
            "agency_ids.agency_id": user?.reference_id,
            "agency_ids.status": "active",
          }),
          Team_Agency.distinct("_id", {
            agency_id: user?.reference_id,
            is_deleted: false,
          }),
        ]);

        member_ids = [...clients, ...agency_teams];
      } else if (user?.role?.name === "client") {
        const [client_details, client_teams] = await Promise.all([
          Client.findById(user?.reference_id).lean(),
          Team_Client.distinct("_id", { client_id: user?.reference_id }),
        ]);

        const agency_ids = [];

        client_details?.agency_ids?.forEach((agency) => {
          if (agency?.status === "active") {
            agency_ids.push(agency?.agency_id);
            return;
          }
          return;
        });

        member_ids = [...agency_ids, ...client_teams];
      }

      return await Authentication.find({
        reference_id: { $in: member_ids },
        is_deleted: false,
      })
        .populate("role", "name")
        .select("first_name last_name email role reference_id")
        .lean();
    } catch (error) {
      logger.error(
        `Error While fetching the users list for the Group: ${error?.message}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  //   this is used for the create the group
  createGroupChat = async (payload, user) => {
    try {
      if (user?.role?.name !== "agency" && user?.role?.name !== "client")
        return throwError(returnMessage("chat", "insufficientPermission"));

      let { group_name, members } = payload;
      if (members.length === 0)
        return throwError(returnMessage("chat", "membersRequired"));

      if (!group_name || group_name === "")
        return throwError(returnMessage("chat", "groupNameRequired"));
      members.push(user.reference_id.toString());
      members = [...new Set(members)];

      const new_group = await Group_Chat.create({
        created_by: user?.reference_id,
        members,
        group_name,
      });

      emitEvent("GROUP_CREATED", new_group, members);

      const notification_obj = {
        data_reference_id: new_group?._id,
        from_user: user?.reference_id,
        type: "group",
      };

      let notification_message = returnNotification("chat", "addedToGroup");

      notification_message = notification_message.replaceAll(
        "{{group_name}}",
        group_name
      );

      notification_message = notification_message.replaceAll(
        "{{creator_name}}",
        capitalizeFirstLetter(user?.first_name) +
          " " +
          capitalizeFirstLetter(user?.last_name)
      );

      members.forEach(async (member) => {
        if (member === user?.reference_id) return;
        let message = notification_message;
        const [member_details, pending_notification] = await Promise.all([
          Authentication.findOne({
            reference_id: member,
          }).lean(),
          Notification.countDocuments({
            user_id: member,
            is_read: false,
          }),
        ]);

        message = message.replaceAll(
          "{{user_name}}",
          capitalizeFirstLetter(member_details?.first_name) +
            " " +
            capitalizeFirstLetter(member_details?.last_name)
        );
        notification_obj.user_id = member;
        notification_obj.message = message;

        await Notification.create(notification_obj);

        eventEmitter(
          "NOTIFICATION",
          {
            notification: notification_obj,
            un_read_count: pending_notification,
          },
          member
        );
        return;
      });

      return;
    } catch (error) {
      logger.error(`Error while creating the group: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to convert the array of users object ids to string type object id so we can
  // send socket event to that array of users id
  objectIdToString = (ids) => {
    return ids.map((id) => id.toString());
  };

  groupsList = async (user) => {
    try {
      const group_ids = await Group_Chat.find({
        members: { $in: [user?.reference_id] },
        is_deleted: false,
      }).sort({ createdAt: -1 });

      const unique_groups_ids = group_ids.map((group_id) =>
        group_id?._id?.toString()
      );

      const [chat_messages, notifications] = await Promise.all([
        Chat.find({
          group_id: { $in: unique_groups_ids },
          is_deleted: false,
        }).sort({ createdAt: -1 }),
        Notification.find({
          type: "group",
          user_id: user?.reference_id,
          group_id: { $in: unique_groups_ids },
          is_read: false,
          is_deleted: false,
        })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      const updated_group_id = [];
      const final_group_array = [];
      for (let i = 0; i < chat_messages.length; i++) {
        if (
          !updated_group_id.includes(chat_messages[i]?.group_id?.toString())
        ) {
          updated_group_id.push(chat_messages[i]?.group_id?.toString());
          const index = group_ids.findIndex(
            (gid) =>
              gid?._id?.toString() == chat_messages[i]?.group_id?.toString()
          );

          if (index !== -1) {
            const group = group_ids[index];
            const group_obj = {
              group_name: group?.group_name,
              last_message_date: chat_messages[i]?.createdAt,
            };

            const unread = notifications.some(
              (noti) =>
                noti?.user_id?.toString() == user?.reference_id?.toString() &&
                noti?.group_id?.toString() == group?._id?.toString()
            );
            if (unread) group_obj["unread"] = true;
            else group_obj["unread"] = false;
            final_group_array.push(group_obj);
            group_ids.splice(index, 1);
          }
        }
      }

      return [...final_group_array, ...group_ids];
    } catch (error) {
      logger.error(`Error while fetching the group list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = GroupChatService;
