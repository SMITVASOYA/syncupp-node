const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { sendResponse } = require("../utils/sendResponse");
const ChatService = require("../services/chatService");
const chatService = new ChatService();

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
