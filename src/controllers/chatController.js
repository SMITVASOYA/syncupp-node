const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const ChatService = require("../services/chatService");
const GroupChatService = require("../services/groupChatService");
const chatService = new ChatService();
const groupChatService = new GroupChatService();

exports.fetchUsersList = catchAsyncError(async (req, res, next) => {
  const users_list = await chatService.fetchUsersList(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("chat", "usersListFetched"),
    users_list,
    statusCode.success
  );
});

exports.chatHistory = catchAsyncError(async (req, res, next) => {
  const chat_history = await chatService.chatHistory(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("chat", "historyFetched"),
    chat_history,
    statusCode.success
  );
});

// this will use to fetch the users list for the group chat
exports.fetchUsers = catchAsyncError(async (req, res, next) => {
  const users = await groupChatService.usersList(req.user);
  sendResponse(res, true, undefined, users, 200);
});
