import * as express from "express";

import { Context } from "@azure/functions";
import {
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { parseJSON, toError } from "fp-ts/lib/Either";
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
  payload: ValidateOtpPayload
) => Promise<ResponseTypes>;

export const CommonOtpPayload = t.interface({
  expiresAt: Timestamp,
  fiscalCode: FiscalCode
});

export type CommonOtpPayload = t.TypeOf<typeof CommonOtpPayload>;

const retrieveOtp = (
  redisClient: RedisClient,
  otpCode: OtpCode
): TaskEither<Error, Option<OtpValidationResponse>> =>
  getTask(redisClient, `${OTP_PREFIX}${otpCode}`).chain(maybeOtp =>
    maybeOtp.foldL(
      () => taskEither.of(none),
      otpPayloadString =>
        fromEither(
          parseJSON(otpPayloadString, toError).chain(_ =>
            CommonOtpPayload.decode(_).mapLeft(
              () => new Error("Cannot decode Otp Payload")
            )
          )
        ).chain(otpPayload =>
          fromEither(
            OtpValidationResponse.decode({
              expires_at: otpPayload.expiresAt
            }).bimap(() => new Error("Cannot decode Otp"), some)
          )
        )
    )
  );

export function ValidateOtpHandler(
  redisClient: RedisClient
): IGetValidateOtpHandler {
  return async (_, payload) =>
    retrieveOtp(redisClient, payload.otp_code)
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(() =>
        ResponseErrorInternal("Cannot validate OTP Code")
      )
      .chain<OtpValidationResponse>(maybeOtp =>
        maybeOtp.foldL(
          () =>
            fromLeft(
              ResponseErrorNotFound("Not Found", "OTP Not Found or invalid")
            ),
          otp => taskEither.of(otp)
        )
      )
      .fold<ResponseTypes>(identity, ResponseSuccessJson)
      .run();
}

export function ValidateOtp(redisClient: RedisClient): express.RequestHandler {
  const handler = ValidateOtpHandler(redisClient);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredBodyPayloadMiddleware(ValidateOtpPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
