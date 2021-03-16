import { Context } from "@azure/functions";

export const mapWithPrivacyLog = (
  context: Context,
  logPrefix: string,
  stringToObfuscate?: string
) => <T>(err: Error, response: T): T => {
  const errorMessage = stringToObfuscate
    ? err.message?.replace(stringToObfuscate, "<secret>")
    : err.message;
  context.log.error(`${logPrefix}|ERROR=${errorMessage}`);
  return response;
};
