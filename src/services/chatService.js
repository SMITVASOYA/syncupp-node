const Chat = require("../models/chatSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const Team_Client = require("../models/teamClientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Notification = require("../models/notificationSchema");
const { default: mongoose } = require("mongoose");
const { returnMessage } = require("../utils/utils");
const Group_Chat = require("../models/groupChatSchema");
const { eventEmitter } = require("../socket");

class ChatService {
  // this function is used to get hte history between 2 users
  chatHistory = async (payload, user) => {
    try {
      if (!payload?.to_user)
        return throwError(returnMessage("chat", "userIdRequired"));
      const search_obj = {};
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          { message: { $regex: payload?.search.toLowerCase(), $options: "i" } },
        ];
      }
      const chats = await Chat.find({
        $or: [
          {
            $and: [
              { from_user: user?.reference_id },
              { to_user: payload?.to_user },
            ],
          },
          {
            $and: [
              { from_user: payload?.to_user },
              { to_user: user?.reference_id },
            ],
          },
        ],
        is_deleted: false,
        ...search_obj,
      })
        .sort({ createdAt: 1 })
        .lean();

      await Notification.updateMany(
        { user_id: user?.reference_id, from_user: payload?.to_user },
        { $set: { is_read: true } }
      );
      return chats;
    } catch (error) {
      logger.error(`Erroe while fetching the chat history: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to fetched the all of the users where we have started the chat
  fetchUsersList = async (payload, user) => {
    try {
      // below loop is used to get the unique users list where user had chat

      if (user?.role?.name === "agency") {
        return await this.fetchUsersListForAgency(payload, user);
      } else if (user?.role?.name === "client") {
        return await this.fetchUsersListForClients(payload, user);
      } else if (user?.role?.name === "team_agency") {
        return await this.fetchUsersListForTeamAgency(payload, user);
      } else if (user?.role?.name === "team_client") {
        return await this.fetchUsersListForTeamClient(payload, user);
      }
    } catch (error) {
      logger.error(`Error while fetching the users list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchUsersListForAgency = async (payload, user) => {
    try {
      let ids;
      if (payload?.for === "client") {
        const [clients_id, team_clients_id] = await Promise.all([
          Client.distinct("_id", {
            "agency_ids.agency_id": user?.reference_id,
            "agency_ids.status": { $ne: "pending" },
          }).lean(),
          Team_Client.distinct("_id", {
            "agency_ids.agency_id": user?.reference_id,
            "agency_ids.status": { $ne: "pending" },
          }).lean(),
        ]);
        // combined the client and team client ids to get the email and name
        ids = [...clients_id, ...team_clients_id];
      } else if (payload?.for === "team") {
        const team_agency_id = await Team_Agency.distinct("_id", {
          agency_id: user?.reference_id,
        }).lean();

        ids = [...team_agency_id];
      }
      return await this.fetchChatusers(user, ids, payload);

      // commented because of the duplicate code
      // const [unread_messages, users] = await Promise.all([
      //   Notification.find({
      //     user_id: { $in: chat_users_ids },
      //     type: "chat",
      //     is_read: false,
      //   }).lean(),
      //   Authentication.find({
      //     reference_id: { $in: chat_users_ids },
      //     status: "confirmed",
      //   })
      //     .select("name first_name last_name email")
      //     .lean(),
      // ]);

      // // it will used to get is there any messages that are un-seen
      // users.forEach((usr) => {
      //   const unread = unread_messages.some(
      //     (noti) =>
      //       noti?.from_user?.toString() === usr?.reference_id?.toString() &&
      //       noti?.user_id?.toString() === user?.reference_id?.toString()
      //   );

      //   if (unread) user.unread = true;
      //   else user.unread = false;

      //   return;
      // });

      // return users;
    } catch (error) {
      logger.error(
        `Error while fetching users list for the agency only: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchUsersListForClients = async (payload, user) => {
    try {
      let ids;
      const client = await Client.findById(user?.reference_id).lean();
      const agency_ids = client?.agency_ids?.map((agency) => {
        if (agency?.status !== "pending") return agency?.agency_id;
      });
      if (payload?.for === "agency") {
        const team_agency_ids = await Team_Agency.distinct("_id", {
          agency_id: { $in: agency_ids },
        }).lean();
        ids = [...agency_ids, ...team_agency_ids];
      } else if (payload?.for === "team") {
        // removed the agency team members from the combined
        // const [team_agency_ids, team_client_ids] = await Promise.all([
        //   Team_Agency.distinct("_id", {
        //     agency_id: { $in: agency_ids },
        //   }).lean(),
        //   Team_Client.distinct("_id", { client_id: user?.reference_id }).lean(),
        // ]);
        // ids = [...team_agency_ids, ...team_client_ids];

        const team_client_ids = await Team_Client.distinct("_id", {
          client_id: user?.reference_id,
        }).lean();

        ids = [...team_client_ids];
      }
      return await this.fetchChatusers(user, ids, payload);
    } catch (error) {
      logger.error(
        `Error while fetching users list for the Client only: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchUsersListForTeamAgency = async (payload, user) => {
    try {
      let ids = [];
      const team_agency_detail = await Team_Agency.findById(
        user?.reference_id
      ).lean();
      if (payload?.for === "team") {
        const team_agency_ids = await Team_Agency.distinct("_id", {
          agency_id: team_agency_detail?.agency_id,
          _id: { $ne: team_agency_detail._id },
        }).lean();
        ids = [...team_agency_ids];
        ids.push(team_agency_detail.agency_id);
      } else if (payload?.for === "client") {
        const [clients_id, team_clients_id] = await Promise.all([
          Client.distinct("_id", {
            "agency_ids.agency_id": team_agency_detail?.agency_id,
            "agency_ids.status": { $ne: "pending" },
          }).lean(),
          Team_Client.distinct("_id", {
            "agency_ids.agency_id": team_agency_detail?.agency_id,
            "agency_ids.status": { $ne: "pending" },
          }).lean(),
        ]);

        ids = [...clients_id, ...team_clients_id];
      }
      return await this.fetchChatusers(user, ids, payload);
    } catch (error) {
      logger.error(
        `Error while fetching users list for the team agency only: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchUsersListForTeamClient = async (payload, user) => {
    try {
      let ids = [];
      const team_client_detail = await Team_Client.findById(
        user?.reference_id
      ).lean();

      if (payload?.for === "team") {
        const team_client_ids = await Team_Client.distinct("_id", {
          client_id: team_client_detail?.client_id,
          _id: { $ne: team_client_detail._id },
        }).lean();
        ids = [...team_client_ids];
        ids.push(team_client_detail.client_id);
      } else if (payload?.for === "agency") {
        const agency_ids = team_client_detail?.agency_ids?.map((agency) => {
          if (agency?.status !== "pending") return agency?.agency_id;
        });

        const team_agency_ids = await Team_Agency.distinct("_id", {
          agency_id: { $in: agency_ids },
        }).lean();

        ids = [...agency_ids, ...team_agency_ids];
      }
      return await this.fetchChatusers(user, ids, payload);
    } catch (error) {
      logger.error(
        `Error while fetching users list for the Team client only: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // below function is used for the fetch the all users list based on the last message and notification of unread messages
  fetchChatusers = async (user, ids, payload) => {
    try {
      const chats = await Chat.find({
        $or: [
          {
            $and: [
              { from_user: user?.reference_id },
              { to_user: { $in: ids } },
            ],
          },
          {
            $and: [
              { from_user: { $in: ids } },
              { to_user: user?.reference_id },
            ],
          },
        ],
        is_deleted: false,
      })
        .sort({ createdAt: -1 })
        .lean();

      let chat_users_ids = [];
      const last_message = [];
      chats?.forEach((chat) => {
        if (chat?.from_user?.toString() === user?.reference_id?.toString()) {
          chat_users_ids.push(chat?.to_user?.toString());
          last_message.push(chat);
          return;
        } else if (
          chat?.to_user?.toString() === user?.reference_id?.toString()
        ) {
          chat_users_ids.push(chat?.from_user?.toString());
          last_message.push(chat);
          return;
        }
        return;
      });

      ids?.forEach((id) => {
        if (!chat_users_ids.includes(id?.toString()))
          chat_users_ids.push(id?.toString());
      });

      chat_users_ids = chat_users_ids.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      let agencyObj = {
        reference_id: { $in: chat_users_ids },
        status: "confirmed",
      };
      let queryObj = {};
      if (payload?.search && payload?.search !== "") {
        queryObj = {
          $or: [
            {
              name: {
                $regex: payload.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              first_name: {
                $regex: payload.search.toLowerCase(),
                $options: "i",
              },
            },
            {
              last_name: {
                $elemMatch: {
                  $regex: payload.search.toLowerCase(),
                  $options: "i",
                },
              },
            },
          ],
        };
      }
      const chatPipeline = [
        {
          $match: agencyObj,
        },
        {
          $match: queryObj,
        },

        {
          $project: {
            first_name: 1,
            last_name: 1,
            image_url: 1,
            name: 1,
            email: 1,
            is_online: 1,
            created_by: 1,
            reference_id: 1,
          },
        },
      ];
      const [unread_messages, users] = await Promise.all([
        Notification.find({
          user_id: user?.reference_id,
          from_user: { $in: chat_users_ids },
          type: "chat",
          is_read: false,
        }).lean(),
        Authentication.aggregate(chatPipeline),
      ]);

      // it will used to get is there any messages that are un-seen
      users?.forEach((usr) => {
        const unread = unread_messages.some(
          (noti) =>
            noti?.from_user?.toString() === usr?.reference_id?.toString() &&
            noti?.user_id?.toString() === user?.reference_id?.toString()
        );
        if (unread) usr["unread"] = true;
        else usr["unread"] = false;

        const last_chat = last_message.find(
          (message) =>
            (message?.from_user?.toString() == user?.reference_id?.toString() &&
              message?.to_user?.toString() == usr?.reference_id?.toString()) ||
            (message?.to_user?.toString() == user?.reference_id?.toString() &&
              message?.from_user?.toString() == usr?.reference_id?.toString())
        );

        if (last_chat) usr["last_message_date"] = last_chat?.createdAt;
        return;
      });

      users.sort((a, b) => a?.createdAt - b?.createdAt);

      return users;
    } catch (error) {
      logger.error(`Error while fetching chat users: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  uploadImage = async (payload, file) => {
    try {
      const chat_obj = {
        from_user: payload?.from_user,
        message_type: "image",
      };

      if (file) {
        chat_obj.image_url = file?.filename;
      }

      let user_detail, event_name, receivers;
      if (payload?.to_user) {
        chat_obj.to_user = payload?.to_user;
        event_name = "RECEIVED_IMAGE";
        receivers = [payload?.from_user, payload?.to_user];
      } else if (payload?.group_id) {
        chat_obj.group_id = payload?.group_id;
        user_detail = await Authentication.findOne({
          reference_id: payload?.from_user,
        })
          .select("first_name last_name reference_id")
          .lean();
        event_name = "GROUP_RECEIVED_IMAGE";
        receivers = payload?.group_id;
      }

      let new_message = await Chat.create(chat_obj);
      new_message = new_message.toJSON();
      const socket_obj = {
        ...new_message,
        user_detail,
        user_type: payload?.user_type,
      };

      eventEmitter(event_name, socket_obj, receivers);
      return;
    } catch (error) {
      logger.error(`Error while uploading the image: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  uploadDocument = async (payload, file) => {
    try {
      const chat_obj = {
        from_user: payload?.from_user,
        message_type: "document",
      };

      if (file) {
        chat_obj.document_url = file?.filename;
      }

      let user_detail, event_name, receivers;
      if (payload?.to_user) {
        chat_obj.to_user = payload?.to_user;
        event_name = "RECEIVED_DOCUMENT";
        receivers = [payload?.from_user, payload?.to_user];
      } else if (payload?.group_id) {
        chat_obj.group_id = payload?.group_id;
        user_detail = await Authentication.findOne({
          reference_id: payload?.from_user,
        })
          .select("first_name last_name reference_id")
          .lean();
        event_name = "GROUP_RECEIVED_DOCUMENT";
        receivers = payload?.group_id;
      }

      let new_message = await Chat.create(chat_obj);
      new_message = new_message.toJSON();
      const socket_obj = {
        ...new_message,
        user_detail,
        user_type: payload?.user_type,
      };

      eventEmitter(event_name, socket_obj, receivers);

      return;
    } catch (error) {
      logger.error(`Error while uploading the image: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ChatService;
