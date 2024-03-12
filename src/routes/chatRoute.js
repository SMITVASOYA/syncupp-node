const chatRoute = require("express").Router();
const { protect } = require("../middlewares/authMiddleware");
const chatController = require("../controllers/chatController");

chatRoute.use(protect);
chatRoute.post("/users", chatController.fetchUsersList);
chatRoute.post("/history", chatController.chatHistory);
chatRoute.get("/group/users", chatController.fetchUsers);

module.exports = chatRoute;
