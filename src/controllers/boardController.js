const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const BoardService = require("../services/boardService");
const { sendResponse } = require("../utils/sendResponse");
const boardService = new BoardService();

// Add Board

exports.addBoard = catchAsyncError(async (req, res, next) => {
  const addBoard = await boardService.addBoard(req.body, req?.user, req?.file);
  sendResponse(
    res,
    true,
    returnMessage("board", "created"),
    addBoard,
    statusCode.success
  );
});

// Update Board

exports.updateBoard = catchAsyncError(async (req, res, next) => {
  const updateBoard = await boardService.updateBoard(
    req.body,
    req?.params.id,
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
  const listBoards = await boardService.listBoards(req.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("board", "listFetched"),
    listBoard,
    statusCode.success
  );
});
