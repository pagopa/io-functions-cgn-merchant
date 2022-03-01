import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";
import * as randomstring from "randomstring";
import { Otp } from "../generated/definitions/Otp";
import { generateOtpCode } from "../utils/cgnCode";
import { retrieveOtpByFiscalCode, storeOtpAndRelatedFiscalCode } from "./redis";

type ResponseTypes =
  | IResponseSuccessJson<Otp>
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal;

type IGetGenerateOtpHandler = (context: Context) => Promise<ResponseTypes>;

const generateNewOtpAndStore = (
  redisClient: RedisClient,
  fiscalCode: FiscalCode,
  otpTtl: NonNegativeInteger
): TE.TaskEither<IResponseErrorInternal, Otp> =>
  pipe(
    TE.tryCatch(() => generateOtpCode(), E.toError),
    TE.bimap(
      e => ResponseErrorInternal(`Cannot generate OTP Code| ${e.message}`),
      otpCode => ({
        code: otpCode,
        expires_at: date_fns.addSeconds(Date.now(), otpTtl),
        ttl: otpTtl
      })
    ),
    TE.chain(newOtp =>
      pipe(
        storeOtpAndRelatedFiscalCode(
          redisClient,
          newOtp.code,
          {
            expiresAt: newOtp.expires_at,
            fiscalCode,
            ttl: otpTtl
          },
          otpTtl
        ),
        TE.bimap(
          err => ResponseErrorInternal(err.message),
          () => newOtp
        )
      )
    )
  );

const generateFakeFiscalCode = (): FiscalCode =>
  pipe(
    randomstring.generate({
      capitalization: "uppercase",
      charset: "alphabetic",
      length: 6
    }),
    s => ({
      d: randomstring.generate({
        charset: "numeric",
        length: 7
      }),
      s
    }),
    ({ s, d }) =>
      [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join("")
  ) as FiscalCode;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetGenerateOtpHandler(
  redisClient: RedisClient,
  otpTtl: NonNegativeInteger
): IGetGenerateOtpHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async _ =>
    pipe(
      generateFakeFiscalCode(),
      fiscalCode =>
        pipe(
          retrieveOtpByFiscalCode(redisClient, fiscalCode),
          TE.mapLeft(e =>
            ResponseErrorInternal(
              `Cannot retrieve OTP from fiscalCode| ${e.message}`
            )
          ),
          TE.chain(
            flow(
              O.fold(
                () => generateNewOtpAndStore(redisClient, fiscalCode, otpTtl),
                otp => TE.of(otp)
              )
            )
          ),
          TE.map(ResponseSuccessJson)
        ),
      TE.toUnion
    )();
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetGenerateOtp(
  redisClient: RedisClient,
  otpTtl: NonNegativeInteger
): express.RequestHandler {
  const handler = GetGenerateOtpHandler(redisClient, otpTtl);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
