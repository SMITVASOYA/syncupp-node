const chatHistory = {
  tags: ["Chat - CRM Panel"],
  description: "",
  summary: "Fetch Chat history betweeen 2 users.",
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
            to_user: { type: "string", required: true },
            search: { type: "string" },
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

const usersList = {
  tags: ["Chat - CRM Panel"],
  description: "",
  summary: "Fetch users list for the chat",
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
            for: { type: "string" },
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

const chatRoute = {
  "/api/v1/chat/history": {
    post: chatHistory,
  },
  "/api/v1/chat/users": {
    post: usersList,
  },
};

module.exports = chatRoute;
