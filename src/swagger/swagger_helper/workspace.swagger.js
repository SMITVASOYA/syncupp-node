const workspaces = {
  tags: ["Workspace - CRM Panel"],
  description: "",
  summary: "List of workspaces",
  responses: {
    200: {
      descripition: "ok",
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

const workspaceRoute = {
  "/api/v1/workspace/list": {
    get: workspaces,
  },
};

module.exports = workspaceRoute;
