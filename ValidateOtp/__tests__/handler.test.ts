/* tslint:disable: no-any */

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { none, some } from "fp-ts/lib/Option";
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { Otp } from "../../generated/definitions/Otp";
import { OtpCode } from "../../generated/definitions/OtpCode";
import { ValidateOtpPayload } from "../../generated/definitions/ValidateOtpPayload";
import * as redis_storage from "../../utils/redis_storage";
import { GetValidateOtpHandler, OtpPayload } from "../handler";

const anOtpCode = "AAAAAAAA123" as OtpCode;
const aWrongOtpCode = "AAA";
const anOtpTtl = 10 as NonNegativeInteger;
const aFiscalCode = "DNLLSS99S20H501F" as FiscalCode;
const aValidationPayload: ValidateOtpPayload = {
  invalidate_otp: false
};
const anOtp: Otp = {
  code: anOtpCode,
  expires_at: new Date(),
  ttl: anOtpTtl
};

const anOtpPayload: OtpPayload = {
  expiresAt: anOtp.expires_at,
  fiscalCode: aFiscalCode,
  ttl: anOtpTtl
};

const getTaskMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(some(JSON.stringify(anOtpPayload))));
jest.spyOn(redis_storage, "getTask").mockImplementation(getTaskMock);

describe("GetValidateOtpHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an internal error if Redis retrieve fails", async () => {
    getTaskMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot read from Redis"))
    );
    const handler = GetValidateOtpHandler({} as any);
    const response = await handler({} as any, anOtpCode, aValidationPayload);
    expect(response.kind).toBe("IResponseErrorInternal");
  });
  it("should return an internal error if Otp payload cannot be parsed", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(some("")));
    const handler = GetValidateOtpHandler({} as any);
    const response = await handler({} as any, anOtpCode, aValidationPayload);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Otp cannot be decoded", async () => {
    const handler = GetValidateOtpHandler({} as any);
    const response = await handler(
      {} as any,
      aWrongOtpCode as any,
      aValidationPayload
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return Not found if Otp code doesn't match on Redis", async () => {
    getTaskMock.mockImplementationOnce(() => taskEither.of(none));
    const handler = GetValidateOtpHandler({} as any);
    const response = await handler({} as any, anOtpCode, aValidationPayload);
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return success if otp validation succeed", async () => {
    const handler = GetValidateOtpHandler({} as any);
    const response = await handler({} as any, anOtpCode, aValidationPayload);
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        expires_at: anOtp.expires_at
      });
    }
  });
});
