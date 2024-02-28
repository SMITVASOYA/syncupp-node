let io;
const { Server } = require("socket.io");
const logger = require("./logger");

exports.socket_connection = (http_server) => {
  io = new Server(http_server, {
    cors: {
      origin: [
        "http://172.16.0.241:3000",
        "http://localhost:3000",
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
    socket.on("ROOM", (obj) => {
      logger.info(obj.id, 15);
      socket.join(obj.id);
    });

    // When Data delivered
    socket.on("CONFIRMATION", (payload) => {
      logger.info(`Event Confirmation : ${payload.name} ${payload.id}`);
    });
  });
};

exports.eventEmitter = (event_name, payload, user_id) => {
  try {
    if (Array.isArray(user_id)) {
      user_id.forEach((user_id) => {
        io.to(user_id.toString()).emit(event_name, payload);
      });
    } else {
      io.to(user_id.toString()).emit(event_name, payload);
    }
  } catch (error) {
    logger.info("Error while emitting socket error", error);
  }
};
