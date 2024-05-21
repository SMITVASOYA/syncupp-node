const {
  protect,
  authorizeMultipleRoles,
} = require("../middlewares/authMiddleware");
const boardRoute = require("express").Router();
const { validateCreateBoard } = require("../validators/board.validator");
const validatorFunc = require("../utils/validatorFunction.helper");
const boardController = require("../controllers/boardController");
const { checkProfileSize, upload } = require("../helpers/multer");

boardRoute.use(protect);

boardRoute.post(
  "/create-board",
  authorizeMultipleRoles(["agency", "team_agency"]),
  checkProfileSize,
  upload.single("board_image"),
  validateCreateBoard,
  validatorFunc,
  boardController.addBoard
);
boardRoute.put("/pin-status", boardController.changePinStatus);

boardRoute.put(
  "/:id",
  checkProfileSize,
  authorizeMultipleRoles(["agency", "team_agency"]),
  upload.single("board_image"),
  boardController.updateBoard
);

boardRoute.get(
  "/fetch-users",
  authorizeMultipleRoles(["agency", "team_agency"]),
  boardController.allUserList
);
boardRoute.post("/get-boards", boardController.listBoards);
boardRoute.get("/:id", boardController.getBoard);
boardRoute.get("/member-list/:id", boardController.memberList);
boardRoute.post(
  "/add-remove-user",
  authorizeMultipleRoles(["agency", "team_agency"]),
  boardController.addRemoveMember
);
boardRoute.get(
  "/image/board-images",
  authorizeMultipleRoles(["agency", "team_agency"]),
  boardController.fetchBoardImage
);

module.exports = boardRoute;
