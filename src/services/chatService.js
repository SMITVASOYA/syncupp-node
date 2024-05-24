const Chat = require("../models/chatSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const Authentication = require("../models/authenticationSchema");
const Notification = require("../models/notificationSchema");
const mongoose = require("mongoose");
const { returnMessage, paginationObject } = require("../utils/utils");
const { eventEmitter } = require("../socket");
const path = require("path");
const fs = require("fs");
const Workspace = require("../models/workspaceSchema");
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
        workspace_id: user?.workspace,
        $or: [
          {
            $and: [{ from_user: user?._id }, { to_user: payload?.to_user }],
          },
          {
            $and: [{ from_user: payload?.to_user }, { to_user: user?._id }],
          },
        ],
        is_deleted: false,
        ...search_obj,
      })
        .sort({ createdAt: 1 })
        .lean();
      const aggregatedChats = await this.aggregateChats(chats);
      await Notification.updateMany(
        { user_id: user?._id, from_user: payload?.to_user },
        { $set: { is_read: true } }
      );
      return aggregatedChats;
    } catch (error) {
      logger.error(`Erroe while fetching the chat history: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
  //for fetch reacted user details
  aggregateChats = async (chats) => {
    try {
      const chatIds = chats.map((chat) => chat._id);

      return await Chat.aggregate([
        {
          $match: { _id: { $in: chatIds } },
        },
        {
          $unwind: { path: "$reactions", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "reactions.user",
            foreignField: "_id",
            as: "reactions.user",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                  _id: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$reactions.user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            first_name: "$reactions.user.first_name",
            last_name: "$reactions.user.last_name",
            profile_image: "$reactions.user.profile_image",
            message: 1,
            group_id: 1,
            reactions: 1,
            createdAt: 1,
            document_url: 1,
            image_url: 1,
            audio_url: 1,
            is_deleted: 1,
            message_type: 1,
            _id: 1,
            to_user: 1,
            from_user: 1,
            original_file_name: 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            message: { $first: "$message" },
            createdAt: { $first: "$createdAt" },
            is_deleted: { $first: "$is_deleted" },
            document_url: { $first: "$document_url" },
            image_url: { $first: "$image_url" },
            audio_url: { $first: "$audio_url" },
            message_type: { $first: "$message_type" },
            to_user: { $first: "$to_user" },
            from_user: { $first: "$from_user" },
            reactions: { $push: "$reactions" },
          },
        },
        { $sort: { createdAt: 1 } },
      ]);
    } catch (error) {
      throw error;
    }
  };
  // this function is used to fetched the all of the users where we have started the chat
  fetchUsersList = async (payload, user) => {
    try {
      const workspace = await Workspace.findById(user?.workspace).lean();

      const members_ids = workspace?.members?.map((member) => {
        if (
          member?.user_id?.toString() !== user?._id?.toString() &&
          member?.status === "confirmed"
        )
          return member?.user_id;
      });

      const chats = await Chat.find({
        workspace_id: workspace?._id,
        $or: [
          {
            $and: [{ from_user: user?._id }, { to_user: { $in: members_ids } }],
          },
          {
            $and: [{ from_user: { $in: members_ids } }, { to_user: user?._id }],
          },
        ],
        is_deleted: false,
      })
        .sort({ createdAt: -1 })
        .lean();

      let chat_users_ids = [];
      const last_message = [];
      chats?.forEach((chat) => {
        if (chat?.from_user?.toString() === user?._id?.toString()) {
          chat_users_ids.push(chat?.to_user?.toString());
          last_message.push(chat);
          return;
        } else if (chat?.to_user?.toString() === user?._id?.toString()) {
          chat_users_ids.push(chat?.from_user?.toString());
          last_message.push(chat);
          return;
        }
        return;
      });

      members_ids?.forEach((id) => {
        if (!chat_users_ids.includes(id?.toString()))
          chat_users_ids.push(id?.toString());
      });

      chat_users_ids = chat_users_ids.map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      let queryObj = { _id: { $in: chat_users_ids }, is_deleted: false };

      if (payload?.search && payload?.search !== "") {
        queryObj["$or"] = [
          {
            name: { $regex: payload.search.toLowerCase(), $options: "i" },
          },
          {
            first_name: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            last_name: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
        ];
      }

      const chatPipeline = [
        {
          $match: queryObj,
        },
        {
          $project: {
            first_name: 1,
            last_name: 1,
            image_url: 1,
            name: { $concat: ["$first_name", " ", "$last_name"] },
            email: 1,
            is_online: 1,
            _id: 1,
            profile_image: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ];

      const [unread_messages, users] = await Promise.all([
        Notification.find({
          user_id: user?._id,
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
            noti?.from_user?.toString() === usr?._id?.toString() &&
            noti?.user_id?.toString() === user?._id?.toString()
        );
        if (unread) usr["unread"] = true;
        else usr["unread"] = false;

        const last_chat = last_message.find(
          (message) =>
            (message?.from_user?.toString() == user?._id?.toString() &&
              message?.to_user?.toString() == usr?._id?.toString()) ||
            (message?.to_user?.toString() == user?._id?.toString() &&
              message?.from_user?.toString() == usr?._id?.toString())
        );

        if (last_chat) usr["last_message_date"] = last_chat?.createdAt;
        return;
      });

      users.sort((a, b) => b?.createdAt - a?.createdAt);

      return users;
    } catch (error) {
      logger.error(`Error while fetching the users list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  uploadImage = async (payload, file, user) => {
    try {
      const chat_obj = {
        workspace_id: user?.workspace,
        from_user: payload?.from_user,
        message_type: "image",
      };

      if (file) {
        chat_obj.image_url = file?.filename;
        chat_obj.original_file_name = file?.originalname;
      }

      let user_detail, event_name, receivers;
      if (payload?.to_user) {
        chat_obj.to_user = payload?.to_user;
        event_name = "RECEIVED_IMAGE";
        receivers = [payload?.from_user, payload?.to_user];
      } else if (payload?.group_id) {
        chat_obj.group_id = payload?.group_id;
        user_detail = await Authentication.findById(payload?.from_user)
          .select("first_name last_name profile_image")
          .lean();
        event_name = "GROUP_RECEIVED_IMAGE";
        receivers = payload?.group_id;
      }

      let new_message = await Chat.create(chat_obj);
      new_message = new_message.toJSON();
      const socket_obj = { ...new_message, user_detail };

      eventEmitter(event_name, socket_obj, receivers, user?.workspace);
      return;
    } catch (error) {
      logger.error(`Error while uploading the image: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  uploadDocument = async (payload, file, user) => {
    try {
      const chat_obj = {
        workspace_id: user?.workspace,
        from_user: payload?.from_user,
        message_type: "document",
      };

      if (file) {
        chat_obj.document_url = file?.filename;
        chat_obj.original_file_name = file?.originalname;
      }

      let user_detail, event_name, receivers;
      if (payload?.to_user) {
        chat_obj.to_user = payload?.to_user;
        event_name = "RECEIVED_DOCUMENT";
        receivers = [payload?.from_user, payload?.to_user];
      } else if (payload?.group_id) {
        chat_obj.group_id = payload?.group_id;
        user_detail = await Authentication.findById(payload?.from_user)
          .select("first_name last_name profile_image")
          .lean();
        event_name = "GROUP_RECEIVED_DOCUMENT";
        receivers = payload?.group_id;
      }

      let new_message = await Chat.create(chat_obj);
      new_message = new_message.toJSON();
      const socket_obj = { ...new_message, user_detail };

      eventEmitter(event_name, socket_obj, receivers, user?.workspace);

      return;
    } catch (error) {
      logger.error(`Error while uploading the image: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
  // upload audio and change blob inot mp3 file
  uploadAudio = async (payload, file, user) => {
    try {
      const chat_obj = {
        workspace_id: user?.workspace,
        from_user: payload?.from_user,
        message_type: "audio",
      };

      if (file) {
        // Convert Blob data to Buffer
        const buffer = Buffer.from(file?.buffer, "base64");

        // Assuming you have a directory named 'uploads' to store audio files
        const filePath = path.join(
          __dirname,
          "../",
          "public",
          "uploads",
          `${Date.now()}_audio.mp3`
        );

        // Save the buffer to a file
        fs.writeFileSync(filePath, buffer);
        let audio_Path = this.getFileName(filePath);
        // Store the file path in the chat_obj
        chat_obj.audio_url = audio_Path;
      }

      let user_detail, event_name, receivers;
      if (payload?.to_user) {
        chat_obj.to_user = payload?.to_user;
        event_name = "RECEIVED_AUDIO";
        receivers = [payload?.from_user, payload?.to_user];
      } else if (payload?.group_id) {
        chat_obj.group_id = payload?.group_id;
        user_detail = await Authentication.findById(payload?.from_user)
          .select("first_name last_name reference_id")
          .lean();
        event_name = "GROUP_RECEIVED_AUDIO";
        receivers = payload?.group_id;
      }

      let new_message = await Chat.create(chat_obj);
      new_message = new_message.toJSON();
      const socket_obj = { ...new_message, user_detail };

      eventEmitter(event_name, socket_obj, receivers, user?.workspace);

      return;
    } catch (error) {
      logger.error(`Error while uploading the Audio: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
  getFileName = (filePath) => {
    // Split the file path by backslashes (for Windows paths) or forward slashes (for Unix-like paths)
    const parts = filePath.split(/[\\/]/);
    // Return the last part of the split array, which should be the filename
    return parts[parts.length - 1];
  };

  getAllDocuments = async (payload, user) => {
    try {
      const pagination = paginationObject(payload);
      const query_obj = { workspace_id: user?.workspace };
      const search_obj = {};
      if (payload?.document_type === "images") {
        query_obj["message_type"] = "image";
      } else if (payload?.document_type === "documents") {
        query_obj["message_type"] = "document";
      }

      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          { original_file_name: { $regex: payload.search, $options: "i" } },
        ];
      }
      if (payload?.group_id) {
        query_obj["group_id"] = payload?.group_id;
      }

      if (payload?.to_user)
        query_obj["$or"] = [
          {
            $and: [{ from_user: user?._id }, { to_user: payload?.to_user }],
          },
          {
            $and: [{ to_user: user?._id }, { from_user: payload?.to_user }],
          },
        ];

      const [documents, total_documents] = await Promise.all([
        Chat.find({ ...query_obj, ...search_obj })
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page)
          .lean(),
        Chat.find({ ...query_obj, ...search_obj }).lean(),
      ]);

      const docs = [];
      documents.forEach((doc) => {
        if (doc?.message_type === "image")
          docs.push({
            image: doc?.image_url,
            original_file_name: doc?.original_file_name,
          });
        else if (doc?.message_type === "document")
          docs.push({
            document: doc?.document_url,
            original_file_name: doc?.original_file_name,
          });
      });
      return {
        docs,
        page_count:
          Math.ceil(total_documents.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while getting all documents: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // removed as this is not a part of the second phase
  /*  FetchLatestChat = async (payload, user) => {
    try {
      const { limit } = payload;
      const notifications = await Notification.find({
        user_id: user.reference_id,
        type: "chat",
        is_read: false,
      }).sort({ createdAt: -1, is_read: -1 });

      const chatIds = notifications.map(
        (notification) => notification.data_reference_id
      );

      // Fetch the chats corresponding to the extracted chat IDs
      let pipeline = [
        {
          $match: { _id: { $in: chatIds } },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "from_user",
            foreignField: "reference_id",
            as: "from_user",
            pipeline: [
              {
                $lookup: {
                  from: "role_masters", // Lookup the role_master table
                  localField: "role", // Assuming there's a field "role_id" in authentications table
                  foreignField: "_id",
                  as: "user_role",
                },
              },
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                  reference_id: 1,
                  role: { $arrayElemAt: ["$user_role", 0] }, // Get the first role from the array
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$from_user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            first_name: "$from_user.first_name",
            last_name: "$from_user.last_name",
            profile_image: "$from_user.profile_image",
            message: 1,
            group_id: 1,
            createdAt: 1,
            document_url: 1,
            image_url: 1,
            audio_url: 1,
            is_deleted: 1,
            message_type: 1,
            is_online: 1,
            _id: 1,
            to_user: 1,
            from_user: "$from_user.reference_id",
            user_role: "$from_user.role",
          },
        },
      ];
      const chats = await Chat.aggregate(pipeline);

      const group_ids = await Group_Chat.find({
        members: { $in: [user?.reference_id] },
        is_deleted: false,
      }).sort({ createdAt: -1 });

      const latestGroupChats = [];

      for (const group of group_ids) {
        const latestGroupChat = await Chat.findOne({ group_id: group._id })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();

        if (latestGroupChat) {
          // Add group name to latestGroupChat object
          latestGroupChat["group_name"] = group.group_name;
          latestGroupChats.push(latestGroupChat);
        }
      }
      const latest_chat = await Chat.aggregate([
        {
          $match: { from_user: user.reference_id },
        },
        {
          $sort: { createdAt: -1 }, // Sort by createdAt descending
        },
        {
          $group: {
            _id: "$to_user", // Group by from_user field
            doc: { $first: "$$ROOT" }, // Keep the first document for each group (latest message)
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" }, // Replace the root document with the latest message
        },
        {
          $lookup: {
            from: "authentications",
            localField: "to_user",
            foreignField: "reference_id",
            as: "from_user",
            pipeline: [
              {
                $lookup: {
                  from: "role_masters", // Lookup the role_master table
                  localField: "role", // Assuming there's a field "role_id" in authentications table
                  foreignField: "_id",
                  as: "user_role",
                },
              },
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  profile_image: 1,
                  reference_id: 1,
                  role: { $arrayElemAt: ["$user_role", 0] }, // Get the first role from the array
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: "$from_user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            first_name: "$from_user.first_name",
            last_name: "$from_user.last_name",
            profile_image: "$from_user.profile_image",
            message: 1,
            group_id: 1,
            createdAt: 1,
            document_url: 1,
            image_url: 1,
            audio_url: 1,
            is_deleted: 1,
            is_online: 1,
            message_type: 1,
            _id: 1,
            to_user: 1,
            from_user: "$from_user.reference_id",
            user_role: "$from_user.role",
          },
        },
        { $sort: { createdAt: -1 } }, // Sort again by createdAt descending
      ]);

      // const latest_chats = await Chat.aggregate([
      //   {
      //     $match: {
      //       $or: [
      //         { from_user: user.reference_id }, // Match messages sent by the user
      //         { to_user: user.reference_id }, // Match messages received by the user
      //       ],
      //     },
      //   },
      //   {
      //     $sort: { createdAt: -1 }, // Sort by createdAt descending
      //   },
      //   {
      //     $group: {
      //       _id: { from_user: "$from_user", to_user: "$to_user" }, // Group by both from_user and to_user fields
      //       doc: { $first: "$$ROOT" }, // Keep the first document for each group (latest message)
      //     },
      //   },
      //   {
      //     $replaceRoot: { newRoot: "$doc" }, // Replace the root document with the latest message
      //   },
      //   {
      //     $lookup: {
      //       from: "authentications",
      //       localField: "to_user",
      //       foreignField: "reference_id",
      //       as: "to_user_info",
      //       pipeline: [
      //         // Your pipeline to retrieve user information for to_user
      //       ],
      //     },
      //   },
      //   {
      //     $lookup: {
      //       from: "authentications",
      //       localField: "from_user",
      //       foreignField: "reference_id",
      //       as: "from_user_info",
      //       pipeline: [
      //         // Your pipeline to retrieve user information for from_user
      //       ],
      //     },
      //   },
      //   {
      //     $unwind: {
      //       path: "$to_user_info",
      //       preserveNullAndEmptyArrays: true,
      //     },
      //   },
      //   {
      //     $unwind: {
      //       path: "$from_user_info",
      //       preserveNullAndEmptyArrays: true,
      //     },
      //   },
      //   {
      //     $project: {
      //       to_user_info: {
      //         first_name: 1,
      //         last_name: 1,
      //         profile_image: 1,
      //         reference_id: 1,
      //         role: { $arrayElemAt: ["$to_user_info.user_role", 0] }, // Assuming user_role is an array
      //       },
      //       from_user_info: {
      //         first_name: 1,
      //         last_name: 1,
      //         profile_image: 1,
      //         reference_id: 1,
      //         role: { $arrayElemAt: ["$from_user_info.user_role", 0] }, // Assuming user_role is an array
      //       },
      //       message: 1,
      //       group_id: 1,
      //       createdAt: 1,
      //       document_url: 1,
      //       image_url: 1,
      //       audio_url: 1,
      //       is_deleted: 1,
      //       is_online: 1,
      //       message_type: 1,
      //       _id: 1,
      //       to_user: 1,
      //       from_user: 1,
      //     },
      //   },
      //   { $sort: { createdAt: -1 } }, // Sort again by createdAt descending
      // ]);

      let allChats = [...latestGroupChats, ...latest_chat]
        .filter((chat) => chat) // Filter out undefined values
        .sort((a, b) => b.createdAt - a.createdAt);
      let final_chat = [...chats, ...allChats];
      // Create a Set of unique chat IDs
      const uniqueChatIds = new Set();
      const uniqueChats = [];
      // Filter out duplicate chats based on their IDs
      for (const chat of final_chat) {
        if (!uniqueChatIds.has(chat?._id?.toString())) {
          uniqueChatIds.add(chat?._id?.toString());
          uniqueChats.push(chat);
        }
      }
      const duplicatechatid = new Set();
      const duplicateChat = [];
      for (const chat of uniqueChats) {
        if (!duplicatechatid.has(chat?.group_id?.toString())) {
          duplicatechatid.add(chat?.group_id?.toString());
          duplicateChat.push(chat);
        }
      }
      // Limit the result to the specified limit
      const finalChats = duplicateChat.slice(0, limit);
      // console.log(finalChats, "final");
      return finalChats;
    } catch (error) {
      logger.error(`Error while fetch lastest chats: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  }; */
}

module.exports = ChatService;
