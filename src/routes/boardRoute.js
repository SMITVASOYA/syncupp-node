const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const boardRoute = require("express").Router();
const { validateCreateBoard } = require("../validators/board.validator");
const validatorFunc = require("../utils/validatorFunction.helper");
const boardController = require("../controllers/boardController");
const { checkProfileSize, upload } = require("../helpers/multer");

boardRoute.use(protect);

boardRoute.post(
  "/board/create-board",
  checkProfileSize,
  upload.single("board_image"),
  validateCreateBoard,
  validatorFunc,
  // authorizeRole("agency"),
  boardController.addBoard
);
boardRoute.put(
  "/board/:id",
  checkProfileSize,
  upload.single("board_image"),
  validateCreateBoard,
  validatorFunc,
  // authorizeRole("agency"),
  boardController.updateBoard
);

module.exports = boardRoute;
