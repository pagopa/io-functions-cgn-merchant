import { Context } from "@azure/functions";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

export const mapWithPrivacyLog = (
  context: Context,
  logPrefix: string,
  stringToObfuscate?: NonEmptyString
) => <T>(err: Error, response: T): T => {
  const errorMessage = stringToObfuscate
    ? err.message?.replace(stringToObfuscate, "<secret>")
    : err.message;
  context.log.error(`${logPrefix}|ERROR=${errorMessage}`);
  return response;
};
