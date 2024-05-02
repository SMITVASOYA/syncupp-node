const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const BoardService = require("../services/boardService");
const { sendResponse } = require("../utils/sendResponse");
const boardService = new BoardService();

// Add Board

exports.addBoard = catchAsyncError(async (req, res, next) => {
  await boardService.addBoard(req?.body, req?.user, req?.file);
  sendResponse(
    res,
    true,
    returnMessage("board", "created"),
    null,
    statusCode.success
  );
});

// Get Board

exports.getBoard = catchAsyncError(async (req, res, next) => {
  const get_board = await boardService.getBoard(req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("board", "boardFetched"),
    get_board,
    statusCode.success
  );
});

// Update Board

exports.updateBoard = catchAsyncError(async (req, res, next) => {
  await boardService.updateBoard(
    req?.body,
    req?.params?.id,
    req?.user,
    req?.file
  );
  sendResponse(
    res,
    true,
    returnMessage("board", "updated"),
    null,
    statusCode.success
  );
});

// List Board

exports.listBoards = catchAsyncError(async (req, res, next) => {
  const list_boards = await boardService.listBoards(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("board", "listFetched"),
    list_boards,
    statusCode.success
  );
});

// Pin Board

exports.changePinStatus = catchAsyncError(async (req, res, next) => {
  await boardService.changePinStatus(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("board", "boardPinned"),
    null,
    statusCode.success
  );
});

// Member List

exports.memberList = catchAsyncError(async (req, res, next) => {
  const member_list = await boardService.memberList(req?.params?.id, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("board", "membersFetched"),
    member_list,
    statusCode.success
  );
});
