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
boardRoute.put("/board/pin-status", boardController.changePinStatus);

boardRoute.put(
  "/board/:id",
  checkProfileSize,
  upload.single("board_image"),
  // authorizeRole("agency"),
  boardController.updateBoard
);

boardRoute.post("/board/get-boards", boardController.listBoards);
boardRoute.get("/board/:id", boardController.getBoard);
boardRoute.get("/board/member-list/:id", boardController.memberList);

module.exports = boardRoute;
