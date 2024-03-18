const chatRoute = require("express").Router();
const { protect } = require("../middlewares/authMiddleware");
const chatController = require("../controllers/chatController");
const { upload } = require("../helpers/multer");

chatRoute.use(protect);
chatRoute.post("/users", chatController.fetchUsersList);
chatRoute.post("/history", chatController.chatHistory);
chatRoute.get("/group/users", chatController.fetchUsers);
chatRoute.post("/group/create", chatController.createGroup);
chatRoute.get("/groups", chatController.groups);
chatRoute.post("/group/history", chatController.groupChatHistory);
chatRoute.patch("/group/update", chatController.updateGroup);
chatRoute.get("/group/:groupId", chatController.getGroup);
chatRoute.post(
  "/upload-image",
  upload.single("image"),
  chatController.uploadImage
);
chatRoute.post(
  "/upload-document",
  upload.single("document"),
  chatController.uploadDocument
);

module.exports = chatRoute;
