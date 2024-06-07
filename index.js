const express = require("express");
require("./src/config/connection");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
const port = process.env.PORT || 3000;
const errorHandler = require("./src/helpers/error");
const cors = require("cors");
const rootRoutes = require("./src/routes/index");
const logger = require("./src/logger");
const { insertData } = require("./src/seeder/seeder");
const swagger = require("swagger-ui-express");
const swaggerDoc = require("./src/swagger/swagger.index");
const basicAuth = require("express-basic-auth");
const { setupNightlyCronJob } = require("./src/utils/cronJob");

// -----------------------------Swagger start-----------------------------------
const auth = {
  users: {
    admin: process.env.BASIC_AUTH_PASSWORD,
  },
  challenge: true,
};

app.use("/swagger-doc", basicAuth(auth));
swaggerDoc.host = process.env.SWAGGER_URL;
app.use("/swagger-doc", swagger.serve);
app.use("/swagger-doc", swagger.setup(swaggerDoc));
// -----------------------------Swagger End-----------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "*",
  cors({
    origin: true,
    credentials: true, // Allow cookies to be sent and received
  })
);
const morgan = require("morgan");
const path = require("path");
const { socket_connection } = require("./src/socket");
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "src/public/uploads")));
app.use(
  "/template",
  express.static(path.join(__dirname, "src/public/template"))
);

app.use("/api/v1", rootRoutes);

// handling error from all of the route
app.use(errorHandler);

// Set up Socket.IO server
const http_server = require("http").createServer(app);

setupNightlyCronJob();

http_server.listen(port, async () => {
  // await insertData();
  await socket_connection(http_server);
  logger.info(`Server started at port:${port}`);
});
