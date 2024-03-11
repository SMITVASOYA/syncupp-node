let io;
const { Server } = require("socket.io");
const logger = require("./logger");
const { throwError } = require("./helpers/errorUtil");
const Chat = require("./models/chatSchema");
const Notification = require("./models/notificationSchema");
const { returnMessage } = require("./utils/utils");
const detect_file_type = require("detect-file-type");
const fs = require("fs");
const moment = require("moment");
const Authentication = require("./models/authenticationSchema");

exports.socket_connection = (http_server) => {
  io = new Server(http_server, {
    cors: {
      origin: [
        "http://172.16.0.241:3000",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost",
        "http://104.248.10.11:5010",
      ],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected ${socket.id}`);
    socket.on("disconnect", () => {
      logger.info(`Socket ${socket.id} has disconnected.`);
    });

    // For user joined
    socket.on("ROOM", async (obj) => {
      logger.info(obj.id, 15);
      socket.join(obj.id);
      // for the Online status
      socket.broadcast.emit("USER_ONLINE", { user_id: obj.id });
      await Authentication.findOneAndUpdate(
        { reference_id: obj?.id },
        { is_online: true },
        { new: true }
      );
    });

    socket.on("USER_DISCONNECTED", async (payload) => {
      // for the Offline status
      const user = await Authentication.findByIdAndUpdate(
        payload?.user_id,
        { is_online: false },
        { new: true }
      ).lean();
      socket.broadcast.emit("USER_OFFLINE", { user_id: user?.reference_id });
    });

    // When Data delivered
    socket.on("CONFIRMATION", (payload) => {
      logger.info(`Event Confirmation : ${payload.name} ${payload.id}`);
    });

    // this Socket event is used to send message to the Other user
    socket.on("SEND_MESSAGE", async (payload) => {
      try {
        const { from_user, to_user, message, user_type } = payload;

        const new_chat = await Chat.create({
          from_user,
          to_user,
          message,
          message_type: "message",
        });

        await Notification.create({
          type: "chat",
          user_id: payload?.to_user,
          from_user,
          data_reference_id: new_chat?._id,
          message,
          user_type,
        });

        // emiting the message to the sender to solve multiple device synchronous
        io.to(from_user).emit("RECEIVED_MESSAGE", {
          from_user,
          to_user,
          message,
          createdAt: new_chat.createdAt,
          _id: new_chat?._id,
          user_type,
          message_type: new_chat?.message_type,
        });

        socket.to(to_user).emit("RECEIVED_MESSAGE", {
          from_user,
          to_user,
          message,
          createdAt: new_chat.createdAt,
          _id: new_chat?._id,
          user_type,
          message_type: new_chat?.message_type,
        });
      } catch (error) {
        logger.error(`Error while sending the message: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });

    // this socket event is used when sender and receiver are chating at the same time
    // the use of this event that delete the all of the notification of the unread messages
    // So it will not display at the same time of the chat
    socket.on("ONGOING_CHAT", async (payload) => {
      try {
        await Notification.deleteMany({
          user_id: payload?.from_user,
          from_user: payload?.to_user,
          type: "chat",
        });
      } catch (error) {
        logger.error(`Error while receiving the message: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });

    // This socket event is used for the delete the message if the message is not seen by the other user
    socket.on("DELETE_MESSAGE", async (payload) => {
      try {
        const is_message_seen = await Notification.findOne({
          from_user: payload?.from_user,
          user_id: payload?.to_user,
          is_read: false,
          type: "chat",
        }).lean();

        if (is_message_seen)
          socket.to(payload?.from_user?.toString()).emit("CANNOT_DELETE", {
            error: returnMessage("chat", "canNotDelete"),
          });

        const message = await Chat.findById(payload?.chat_id).lean();

        if (message?.image_url || message?.document_url) {
          if (
            message?.image_url &&
            fs.existsSync(`./src/public/uploads/${message?.image_url}`)
          ) {
            fs.unlink(`./src/public/uploads/${message?.image_url}`, (err) => {
              if (err) {
                logger.error(`Error while unlinking the image: ${err}`);
              }
            });
          } else if (
            message?.document_url &&
            fs.existsSync(`./src/public/uploads/${message?.document_url}`)
          ) {
            fs.unlink(
              `./src/public/uploads/${message?.document_url}`,
              (err) => {
                if (err) {
                  logger.error(`Error while unlinking the documents: ${err}`);
                }
              }
            );
          }
        }

        await Chat.findByIdAndUpdate(payload?.chat_id, { is_deleted: true });
        io.to(payload?.from_user).emit("MESSGAE_DELETED", {
          message: returnMessage("chat", "messageDeleted"),
          _id: payload?.chat_id,
        });
      } catch (error) {
        logger.error(`Error while deleting the message: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });

    // this socket event is used to send the images between the users
    socket.on("IMAGES", async (payload) => {
      try {
        const { from_user, to_user, buffer, user_type } = payload;
        console.log(buffer);
        if (Buffer.byteLength(buffer))
          socket.to(from_user?.toString()).emit("FILE_TO_LARGE", {
            error: returnMessage("chat", "largeImage"),
          });
        const required_image_type = ["jpeg", "jpg", "png"];
        let image_obj;
        detect_file_type.fromBuffer(buffer, (error, result) => {
          if (error || !required_image_type.includes(result.ext))
            socket.to(from_user?.toString()).emit("INVALID_FORMAT", {
              error: returnMessage("chat", "invalidImageFormat"),
            });

          image_obj = result;
        });

        if (image_obj) {
          const image_name = Date.now() + "." + image_obj.ext;
          fs.writeFileSync("./src/public/uploads/" + image_name, buffer, {
            encoding: "base64",
          });

          const new_message = await Chat.create({
            from_user: payload?.from_user,
            to_user: payload?.to_user,
            image_url: image_name,
            message_type: "image",
          });

          await Notification.create({
            user_id: payload?.to_user,
            type: "chat",
            from_user: payload?.from_user,
            data_reference_id: new_message?._id,
          });

          socket.to(from_user).emit("RECEIVED_IMAGE", {
            image_url: image_name,
            from_user,
            to_user,
            message_type: new_message?.message_type,
            _id: new_message?._id,
            createdAt: new_message?.createdAt,
            user_type,
          });

          socket.to(to_user).emit("RECEIVED_IMAGE", {
            image_url: image_name,
            from_user,
            to_user,
            message_type: new_message?.message_type,
            _id: new_message?._id,
            createdAt: new_message?.createdAt,
            user_type,
          });
        }
      } catch (error) {
        logger.error(`Error while uploading the images: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });

    // this socket event is used to send the documents between the users
    socket.on("DOCUMENTS", async (payload) => {
      try {
        const { from_user, to_user, buffer, user_type } = payload;
        if (Buffer.byteLength(buffer) / (1024 * 1024) > 5)
          socket.to(from_user?.toString()).emit("FILE_TO_LARGE", {
            error: returnMessage("chat", "largeDocument"),
          });
        const required_image_type = ["pdf", "xlsx", "csv"];
        let document_obj;
        detect_file_type.fromBuffer(buffer, (error, result) => {
          if (error || !required_image_type.includes(result.ext))
            socket.to(from_user?.toString()).emit("INVALID_FORMAT", {
              error: returnMessage("chat", "invalidDocumentFormat"),
            });

          document_obj = result;
        });

        if (document_obj) {
          const document_name = Date.now() + "." + document_obj.ext;
          fs.writeFileSync("./src/public/uploads/" + document_name, buffer, {
            encoding: "base64",
          });

          const new_message = await Chat.create({
            from_user: payload?.from_user,
            to_user: payload?.to_user,
            document_url: document_name,
            message_type: "document",
          });

          await Notification.create({
            user_id: payload?.to_user,
            type: "chat",
            from_user: payload?.from_user,
            data_reference_id: new_message?._id,
          });

          socket
            .to(from_user?.toString())
            .to(to_user?.toString())
            .emit("RECEIVED_DOCUMENT", {
              document_url: document_name,
              user_type,
              from_user,
              to_user,
              createdAt: new_message?.createdAt,
              _id: new_message?._id,
              message_type: new_message?.message_type,
            });
        }
      } catch (error) {
        logger.error(`Error while uploading the Documents: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });

    // this socket event is used to clear all of the chats between 2 users
    socket.on("CLEAR_CHAT", async (payload) => {
      try {
        await Chat.updateMany(
          {
            $or: [
              {
                $and: [
                  { from_user: payload?.from_user },
                  { to_user: payload?.to_user },
                ],
              },
              {
                $and: [
                  { from_user: payload?.to_user },
                  { to_user: payload?.from_user },
                ],
              },
            ],
          },
          { is_deleted: true }
        );

        await Notification.updateMany(
          {
            $or: [
              {
                $and: [
                  { user_id: payload?.from_user },
                  { from_user: payload?.to_user },
                ],
              },
              {
                $and: [
                  { user_id: payload?.to_user },
                  { from_user: payload?.from_user },
                ],
              },
            ],
          },
          { is_deleted: true, is_read: true }
        );

        socket.to(to_user).emit("CHAT_CLEARED", { message: `Chat is cleared` });
      } catch (error) {
        logger.error(`Error while clearing the chat: ${error}`);
        return throwError(error?.message, error?.statusCode);
      }
    });
  });
};

exports.eventEmitter = (event_name, payload, user_id) => {
  try {
    if (Array.isArray(user_id)) {
      user_id.forEach((user_id) => {
        io.to(user_id?.toString()).emit(event_name, payload);
      });
    } else {
      io.to(user_id?.toString()).emit(event_name, payload);
    }
  } catch (error) {
    logger.info("Error while emitting socket error", error);
  }
};
