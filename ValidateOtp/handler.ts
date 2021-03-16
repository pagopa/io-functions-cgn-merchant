import * as express from "express";

import { Context } from "@azure/functions";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { parseJSON, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { none, Option, some } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  fromPredicate,
  TaskEither,
  taskEither
} from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import * as t from "io-ts";
import { RedisClient } from "redis";
import { OtpCode } from "../generated/definitions/OtpCode";
import { OtpValidationResponse } from "../generated/definitions/OtpValidationResponse";
import { Timestamp } from "../generated/definitions/Timestamp";
import { ValidateOtpPayload } from "../generated/definitions/ValidateOtpPayload";
import { mapWithPrivacyLog } from "../utils/logging";
import { deleteTask, getTask } from "../utils/redis_storage";

// This value is used on redis to prefix key value pair of type
// KEY            | VALUE
// OTP_${otp_code}| {fiscalCode: "...", expires_at: "...", ttl: "..."}
// This prefix must be the same used by io-functions-cgn
// here https://github.com/pagopa/io-functions-cgn/blob/e2607c695556fecdccce8e969c5da978a641fc61/GenerateOtp/redis.ts#L23
export const OTP_PREFIX = "OTP_";

// This value is used on redis to prefix key value pair of type
// KEY                          | VALUE
// OTP_FISCALCODE_${fiscalCode} | otp_code
// This prefix must be the same used by io-functions-cgn
// here https://github.com/pagopa/io-functions-cgn/blob/e2607c695556fecdccce8e969c5da978a641fc61/GenerateOtp/redis.ts#L22
export const OTP_FISCAL_CODE_PREFIX = "OTP_FISCALCODE_";

type ResponseTypes =
  | IResponseSuccessJson<OtpValidationResponse>
  | IResponseErrorNotFound
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

type IGetValidateOtpHandler = (
  context: Context,
  payload: ValidateOtpPayload
) => Promise<ResponseTypes>;

export const CommonOtpPayload = t.interface({
  expiresAt: Timestamp,
  fiscalCode: FiscalCode
});

export type CommonOtpPayload = t.TypeOf<typeof CommonOtpPayload>;

export const OtpResponseAndFiscalCode = t.interface({
  fiscalCode: FiscalCode,
  otpResponse: OtpValidationResponse
});

export type OtpResponseAndFiscalCode = t.TypeOf<
  typeof OtpResponseAndFiscalCode
>;

const retrieveOtp = (
  redisClient: RedisClient,
  otpCode: OtpCode
): TaskEither<Error, Option<OtpResponseAndFiscalCode>> =>
  getTask(redisClient, `${OTP_PREFIX}${otpCode}`).chain(maybeOtp =>
    maybeOtp.foldL(
      () => taskEither.of(none),
      otpPayloadString =>
        fromEither(
          parseJSON(otpPayloadString, toError).chain(_ =>
            CommonOtpPayload.decode(_).mapLeft(
              e => new Error(`Cannot decode Otp Payload [${readableReport(e)}]`)
            )
          )
        ).map(otpPayload =>
          some({
            fiscalCode: otpPayload.fiscalCode,
            otpResponse: {
              expires_at: otpPayload.expiresAt
            }
          })
        )
    )
  );

const invalidateOtp = (
  redisClient: RedisClient,
  otpCode: OtpCode,
  fiscalCode: FiscalCode
): TaskEither<Error, true> =>
  deleteTask(redisClient, `${OTP_PREFIX}${otpCode}`)
    .chain(
      fromPredicate(
        result => result,
        () => new Error("Unexpected delete OTP operation")
      )
    )
    .chain(() =>
      deleteTask(redisClient, `${OTP_FISCAL_CODE_PREFIX}${fiscalCode}`)
    )
    .chain(
      fromPredicate(
        result => result,
        () => new Error("Unexpected delete fiscalCode operation")
      )
    )
    .map(() => true);

export function ValidateOtpHandler(
  redisClient: RedisClient,
  logPrefix: string = "ValidateOtpHandler"
): IGetValidateOtpHandler {
  return async (context, payload) => {
    const errorLogMapping = mapWithPrivacyLog(
      context,
      logPrefix,
      payload.otp_code.toString() as NonEmptyString
    );
    return retrieveOtp(redisClient, payload.otp_code)
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(_ =>
        errorLogMapping(_, ResponseErrorInternal("Cannot validate OTP Code"))
      )
      .chain<OtpValidationResponse>(maybeOtpResponseAndFiscalCode =>
        maybeOtpResponseAndFiscalCode.foldL(
          () =>
            fromLeft(
              ResponseErrorNotFound("Not Found", "OTP Not Found or invalid")
            ),
          otpResponseAndFiscalCode =>
            payload.invalidate_otp
              ? invalidateOtp(
                  redisClient,
                  payload.otp_code,
                  otpResponseAndFiscalCode.fiscalCode
                ).bimap(
                  _ =>
                    errorLogMapping(
                      _,
                      ResponseErrorInternal("Cannot invalidate OTP")
                    ),
                  () => ({
                    expires_at: new Date()
                  })
                )
              : taskEither.of(otpResponseAndFiscalCode.otpResponse)
        )
      )
      .fold<ResponseTypes>(identity, ResponseSuccessJson)
      .run();
  };
}

export function ValidateOtp(redisClient: RedisClient): express.RequestHandler {
  const handler = ValidateOtpHandler(redisClient);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredBodyPayloadMiddleware(ValidateOtpPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
