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
      return await this.fetchChatusers(user, ids);

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
      const agency_ids = client?.agency_ids?.map((agency) =>
        agency?.status !== "pending" ? agency?.agency_id : false
      );
      if (payload?.for === "agency") {
        ids = [...agency_ids];
      } else if (payload?.for === "team") {
        const [team_agency_ids, team_client_ids] = await Promise.all([
          Team_Agency.distinct("_id", {
            agency_id: { $in: agency_ids },
          }).lean(),
          Team_Client.distinct("_id", { client_id: user?.reference_id }).lean(),
        ]);

        ids = [...team_agency_ids, ...team_client_ids];
      }
      return await this.fetchChatusers(user, ids);
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
      if (payload?.for === "agency") {
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
      return await this.fetchChatusers(user, ids);
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

      if (payload?.for === "client") {
        const team_agency_ids = await Team_Agency.distinct("_id", {
          agency_id: team_client_detail?.client_id,
          _id: { $ne: team_client_detail._id },
        }).lean();
        ids = [...team_agency_ids];
        ids.push(team_client_detail.client_id);
      } else if (payload?.for === "agency") {
        const agency_ids = team_client_detail?.agency_ids?.map((agency) => {
          agency?.status !== "pending" ? agency?.agency_id : false;
        });

        const team_agency_ids = await Team_Agency.distinct("_id", {
          agency_id: { $in: agency_ids },
        }).lean();

        ids = [...agency_ids, ...team_agency_ids];
      }
      return await this.fetchChatusers(user, ids);
    } catch (error) {
      logger.error(
        `Error while fetching users list for the Team client only: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // below function is used for the fetch the all users list based on the last message and notification of unread messages
  fetchChatusers = async (user, ids) => {
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

      const [unread_messages, users] = await Promise.all([
        Notification.find({
          user_id: user?.reference_id,
          from_user: { $in: chat_users_ids },
          type: "chat",
          is_read: false,
        }).lean(),
        Authentication.find({
          reference_id: { $in: chat_users_ids },
          $or: [
            { status: { $ne: "payment_pending" } },
            { status: { $ne: "confirm_pending" } },
          ],
        })
          .select(
            "name first_name last_name email reference_id image_url is_online"
          )
          .lean(),
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

      return users;
    } catch (error) {
      logger.error(`Error while fetching chat users: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ChatService;
