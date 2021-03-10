import * as express from "express";

import { Context } from "@azure/functions";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError, tryCatch2v } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { none, Option, some } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither
} from "fp-ts/lib/TaskEither";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import * as t from "io-ts";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { RedisClient } from "redis";
import { Otp } from "../generated/definitions/Otp";
import { OtpCode } from "../generated/definitions/OtpCode";
import { OtpValidationResponse } from "../generated/definitions/OtpValidationResponse";
import { Timestamp } from "../generated/definitions/Timestamp";
import { ValidateOtpPayload } from "../generated/definitions/ValidateOtpPayload";
import { getTask } from "../utils/redis_storage";

const OTP_PREFIX = "OTP_";

type ResponseTypes =
  | IResponseSuccessJson<OtpValidationResponse>
  | IResponseErrorNotFound
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

type IGetValidateOtpHandler = (
  context: Context,
  otpCode: OtpCode,
  payload: ValidateOtpPayload
) => Promise<ResponseTypes>;

export const OtpPayload = t.interface({
  expiresAt: Timestamp,
  fiscalCode: FiscalCode,
  ttl: NonNegativeInteger
});

export type OtpPayload = t.TypeOf<typeof OtpPayload>;

const retrieveOtp = (
  redisClient: RedisClient,
  otpCode: OtpCode
): TaskEither<Error, Option<Otp>> =>
  getTask(redisClient, `${OTP_PREFIX}${otpCode}`).chain(maybeOtp =>
    maybeOtp.foldL(
      () => taskEither.of(none),
      otpPayloadString =>
        fromEither<Error, OtpPayload>(
          tryCatch2v(() => JSON.parse(otpPayloadString), toError)
        ).chain(otpPayload =>
          fromEither(
            Otp.decode({
              code: otpCode,
              expires_at: otpPayload.expiresAt,
              ttl: otpPayload.ttl
            }).bimap(() => new Error("Cannot decode Otp Payload"), some)
          )
        )
    )
  );

export function GetValidateOtpHandler(
  redisClient: RedisClient
): IGetValidateOtpHandler {
  return async (_, otpCode, payload) => {
    return retrieveOtp(redisClient, otpCode)
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
        ResponseErrorInternal("Cannot validate OTP Code")
      )
      .chain(maybeOtp =>
        maybeOtp.foldL(
          () =>
            fromLeft<IResponseErrorNotFound, Otp>(
              ResponseErrorNotFound("Not Found", "OTP Not Found or invalid")
            ),
          otp => taskEither.of<IResponseErrorNotFound, Otp>(otp)
        )
      )
      .map(otp => ({
        expires_at: otp.expires_at
      }))
      .fold<ResponseTypes>(identity, ResponseSuccessJson)
      .run();
  };
}

export function GetValidateOtp(
  redisClient: RedisClient
): express.RequestHandler {
  const handler = GetValidateOtpHandler(redisClient);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("otpcode", OtpCode),
    RequiredBodyPayloadMiddleware(ValidateOtpPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
