const createTask = {
  tags: ["Task - CRM Panel"],
  description: "",
  summary: "Create Task",
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
            title: {
              type: "string",
              required: true,
            },
            agenda: {
              type: "string",
              required: true,
            },
            board_id: {
              type: "string",
              required: true,
            },
            priority: {
              type: "string",
              required: true,
            },
            due_date: {
              type: "string",
            },
            assign_to: {
              type: "array",
              items: {
                type: "string",
              },
              example: [32.3046505, 30.6080822],
            },
            location: {
              type: "array",
              items: {
                type: "array",
              },
              example: [32.3046505, 30.6080822],
            },
            status: {
              type: "string",
              required: true,
            },
            mark_as_done: {
              type: "boolean",
              default: false,
            },
            attachments: {
              type: "string",
              format: "binary",
              description: "Please attach attachments",
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

const updateActivity = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "update Activity for the call or other type",
  security: [
    {
      bearerAuth: [],
    },
  ],
  parameters: [
    {
      name: "activityId",
      in: "path",
      required: true,
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",

          properties: {
            title: {
              type: "string",
              required: true,
            },
            agenda: {
              type: "string",
              required: true,
            },
            client_id: {
              type: "string",
              required: true,
            },
            due_date: {
              type: "string",
              required: true,
            },
            assign_to: {
              type: "string",
              required: true,
            },
            activity_type: {
              type: "string",
              required: true,
            },
            meeting_start_time: {
              type: "string",
              required: true,
            },
            meeting_end_time: {
              type: "string",
              required: true,
            },
            internal_info: {
              type: "string",
            },
            recurring_end_date: {
              type: "string",
            },
            mark_as_done: {
              type: "boolean",
              default: false,
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

const getActivity = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "get Activity for the call or other type",
  security: [
    {
      bearerAuth: [],
    },
  ],
  parameters: [
    {
      name: "activityId",
      in: "path",
      required: true,
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

const activityList = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "Fetch activity list with date filters",
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
            page: {
              type: "number",
              description: "Enter page number.",
              default: 1,
            },
            items_per_page: {
              type: "number",
              description: "Enter item per page.",
              default: 5,
            },
            sort_order: {
              type: "string",
              description: "Enter order of sort asc or desc.",
              default: "desc",
            },
            sort_field: {
              type: "string",
              description: "Enter field to sort.",
              default: "createdAt",
            },
            search: {
              type: "string",
              description: "Enter value of search",
            },
            client_id: { type: "string" },
            agency_id: { type: "string" },
            filter: {
              type: "object",
              properties: {
                status: { type: "string" },
                date: { type: "string" },
                start_date: { type: "string" },
                end_date: { type: "string" },
                activity_type: { type: "string" },
              },
            },
            given_date: { type: "string" },
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

const leaderboard = {
  tags: ["Activity - CRM Panel"],
  description: "Give filter value either weekly or monthly",
  summary: "Leaderboard for the agency only",
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
            filter: { type: "string" },
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

const completionHistory = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "Fetch completion points history",
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
            page: {
              type: "number",
              description: "Enter page number.",
              default: 1,
            },
            items_per_page: {
              type: "number",
              description: "Enter item per page.",
              default: 5,
            },
            sort_order: {
              type: "string",
              description: "Enter order of sort asc or desc.",
              default: "desc",
            },
            sort_field: {
              type: "string",
              description: "Enter field to sort.",
              default: "createdAt",
            },
            search: {
              type: "string",
              description: "Enter value of search",
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

const competitionStats = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "Fetch competition points Stats",
  security: [
    {
      bearerAuth: [],
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

const leaveTask = {
  tags: ["Activity - CRM Panel"],
  description: "",
  summary: "Leave Task",
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
            task_id: {
              type: "string",
              description: "Enter task id.",
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
const taskRoute = {
  "/api/v1/task/create-task": {
    post: createTask,
  },
  "/api/v1/activity/update/call-meeting/{activityId}": {
    patch: updateActivity,
  },
  "/api/v1/activity/call-meeting/{activityId}": {
    get: getActivity,
  },
  "/api/v1/activity/list": {
    post: activityList,
  },
  "/api/v1/activity/leaderboard": {
    post: leaderboard,
  },
  "/api/v1/activity/completion_history": {
    post: completionHistory,
  },
  "/api/v1/activity/competitionStats": {
    get: competitionStats,
  },
  "/api/v1/activity/leave-task": {
    post: leaveTask,
  },
};

module.exports = taskRoute;
