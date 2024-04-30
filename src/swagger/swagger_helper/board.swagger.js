const addBoard = {
  tags: ["Board"],
  description: "",
  summary: "Add Board  ",
  security: [
    {
      bearerAuth: [],
    },
  ],
  requestBody: {
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            project_name: {
              type: "string",
              description: "Enter Project name",
            },
            description: {
              type: "string",
              description: "Enter Description",
            },
            members: {
              type: "array",
              description: "Please add members ids",
            },
            board_image: {
              type: "string",
              description: "Please board_image",
            },
          },
        },
      },
    },
  },

  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};

const updateBoard = {
  tags: ["Board"],
  description: "",
  summary: "Update Board  ",
  security: [
    {
      bearerAuth: [],
    },
  ],
  requestBody: {
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            project_name: {
              type: "string",
              description: "Enter Project name",
            },
            description: {
              type: "string",
              description: "Enter Description",
            },
            members: {
              type: "array",
              description: "Please add members ids",
            },
            board_image: {
              type: "string",
              description: "Please board_image",
            },
          },
        },
      },
    },
  },
  parameters: [
    {
      name: "id",
      in: "path", // or "query" depending on your use case
      description: "ID of the board",
      required: true,
      schema: {
        type: "string", // adjust the type accordingly
      },
    },
  ],
  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};

const changePinStatus = {
  tags: ["Board"],
  description: "",
  summary: "Change pin status",
  security: [
    {
      bearerAuth: [],
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            is_pinned: {
              type: "string",
              description: "Enter status",
              required: true,
            },
            board_id: {
              type: "string",
              description: "Enter board id",
              required: true,
            },
          },
        },
      },
    },
  },

  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};

const getBoard = {
  tags: ["Board"],
  description: "",
  summary: "Get Board",
  security: [
    {
      bearerAuth: [],
    },
  ],

  parameters: [
    {
      name: "id",
      in: "path", // or "query" depending on your use case
      description: "ID of the board",
      required: true,
      schema: {
        type: "string", // adjust the type accordingly
      },
    },
  ],
  requestBody: {},

  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};

const getBoardList = {
  tags: ["Board"],
  description: "",
  summary: "Get Board list  ",
  security: [
    {
      bearerAuth: [],
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            all: {
              type: "boolean",
              description: "Enter sortOrder",
              default: false,
            },
            skip: {
              type: "number",
              description: "Enter skip number",
              default: 0,
              required: true,
            },
            limit: {
              type: "number",
              description: "Enter limit number",
              default: 0,
              required: true,
            },
          },
        },
      },
    },
  },

  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};
const memberList = {
  tags: ["Board"],
  description: "",
  summary: "Member list",
  security: [
    {
      bearerAuth: [],
    },
  ],

  parameters: [
    {
      name: "id",
      in: "path", // or "query" depending on your use case
      description: "ID of the board",
      required: true,
      schema: {
        type: "string", // adjust the type accordingly
      },
    },
  ],
  requestBody: {},

  responses: {
    200: {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
        },
      },
    },
  },
};

const boardRoutes = {
  "/api/v1/board/create-board": {
    post: addBoard,
  },

  "/api/v1/board/pin-status": {
    put: changePinStatus,
  },
  "/api/v1/board/{id}": {
    get: getBoard,
    put: updateBoard,
  },
  "/api/v1/board/get-boards": {
    post: getBoardList,
  },
  "/api/v1/board/member-list/{id}": {
    get: memberList,
  },
};

module.exports = boardRoutes;
