import * as express from "express";
import * as winston from "winston";
import { Context } from "@azure/functions";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import { REDIS_CLIENT } from "../utils/redis";
import { ValidateOtp } from "./handler";

// eslint-disable-next-line functional/no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Binds the express app to an Azure Function handler
const httpStart = async (context: Context): Promise<void> => {
  logger = context.log;

  const redisClient = await REDIS_CLIENT;

  // Add express route
  app.post("/api/v1/cgn/merchant/otp/validate", ValidateOtp(redisClient));

  const azureFunctionHandler = createAzureFunctionHandler(app);

  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
