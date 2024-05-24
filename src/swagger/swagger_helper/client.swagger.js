const verifyClient = {
  tags: ["Client - CRM Panel"],
  description: "",
  summary: "Verify client",
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            email: {
              type: "string",
              descripition: "Enter email of client.",
              required: true,
            },
            agency_id: {
              type: "string",
              descripition: "Enter agency id.",
              required: true,
            },
            password: {
              type: "string",
              descripition:
                "Enter password which should contain one uppercase letter, one lowercase letter, one special character, one number and minimum 8 length.",
            },
            first_name: {
              type: "string",
              descripition: "Enter first name of client.",
            },
            last_name: {
              type: "string",
              descripition: "Enter last name of client.",
            },
            redirect: {
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

const updateClient = {
  tags: ["Client - CRM Panel"],
  description: "",
  summary: "Update client",
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            company_name: {
              type: "string",
              descripition: "Enter company name.",
            },
            company_website: {
              type: "string",
              descripition: "Enter company website.",
            },
            state: {
              type: "string",
              descripition: "Enter state object id.",
            },
            city: {
              type: "string",
              descripition: "Enter city object id.",
            },
            country: {
              type: "string",
              descripition: "Enter country object id.",
            },
            pincode: {
              type: "string",
              descripition: "Enter pincode.",
            },
            address: {
              type: "string",
              descripition: "Enter address.",
            },
            first_name: {
              type: "string",
              descripition: "Enter first name.",
            },
            last_name: {
              type: "string",
              descripition: "Enter last name.",
            },
          },
        },
      },
    },
  },

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

const getClientProfile = {
  tags: ["Client - CRM Panel"],
  description: "",
  summary: "Get client profile",
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

const getClientAgencies = {
  tags: ["Client - CRM Panel"],
  description: "",
  summary: "Get client agencies",
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

const deleteTeamMember = {
  tags: ["Client - CRM Panel"],
  description:
    'Pass data like this {"teamMemberIds" : ["6597aeb9528e7bc34319c6f7" , "6597b11b248ca49192fcb7b9"]}',
  summary: "Delete Team Member of client ",
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
            teamMemberIds: {
              type: "array",
              description: "Enter team member IDS to be delete",
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

const clientRoutes = {
  "/api/v1/client/verify-client": {
    post: verifyClient,
  },
  "/api/v1/client/update": {
    patch: updateClient,
  },
  "/api/v1/client": {
    get: getClientProfile,
  },
  "/api/v1/client/get-agencies": {
    get: getClientAgencies,
  },
  "/api/v1/client/delete": {
    delete: deleteTeamMember,
  },
};

module.exports = clientRoutes;
