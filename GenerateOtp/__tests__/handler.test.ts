/* eslint-disable @typescript-eslint/no-explicit-any */

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { Otp } from "../../generated/definitions/Otp";
import { OtpCode } from "../../generated/definitions/OtpCode";
import * as cgnCode from "../../utils/cgnCode";
import { GetGenerateOtpHandler } from "../handler";
import * as redis_util from "../redis";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const aDefaultOtpTtl = 6000 as NonNegativeInteger;
const anOtpCode = "AAAAAAAA123" as OtpCode;

const anOtp: Otp = {
  code: anOtpCode,
  expires_at: new Date(),
  ttl: 10
};

const storeOtpAndRelatedFiscalCodeMock = jest
  .fn()
  .mockImplementation(() => TE.of(true));
const retrieveOtpByFiscalCodeMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.none));
jest
  .spyOn(redis_util, "retrieveOtpByFiscalCode")
  .mockImplementation(retrieveOtpByFiscalCodeMock);
jest
  .spyOn(redis_util, "storeOtpAndRelatedFiscalCode")
  .mockImplementation(storeOtpAndRelatedFiscalCodeMock);

const generateOtpCodeMock = jest
  .fn()
  .mockImplementation(() => Promise.resolve(anOtpCode));
jest.spyOn(cgnCode, "generateOtpCode").mockImplementation(generateOtpCodeMock);

const successImpl = async () => {
  const handler = GetGenerateOtpHandler({} as any, aDefaultOtpTtl);
  const response = await handler({} as any);
  expect(response.kind).toBe("IResponseSuccessJson");
  if (response.kind === "IResponseSuccessJson") {
    expect(response.value).toMatchObject({
      code: anOtp.code
    });
  }
};
describe("GetGenerateOtpHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an internal error if OTP generation fails", async () => {
    generateOtpCodeMock.mockImplementationOnce(() =>
      Promise.reject(new Error("Cannot generate OTP"))
    );
    const handler = GetGenerateOtpHandler({} as any, aDefaultOtpTtl);
    const response = await handler({} as any);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Redis OTP store fails", async () => {
    storeOtpAndRelatedFiscalCodeMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot store OTP on Redis"))
    );
    const handler = GetGenerateOtpHandler({} as any, aDefaultOtpTtl);
    const response = await handler({} as any);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error if Redis OTP retrieve fails", async () => {
    retrieveOtpByFiscalCodeMock.mockImplementationOnce(() =>
      TE.left(new Error("Cannot retrieve OTP on Redis"))
    );
    const handler = GetGenerateOtpHandler({} as any, aDefaultOtpTtl);
    const response = await handler({} as any);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return success with a previous stored OTP if it is present", async () => {
    retrieveOtpByFiscalCodeMock.mockImplementationOnce(() =>
      TE.of(O.some(anOtp))
    );
    const handler = GetGenerateOtpHandler({} as any, aDefaultOtpTtl);
    const response = await handler({} as any);
    expect(storeOtpAndRelatedFiscalCodeMock).not.toHaveBeenCalled();
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(anOtp);
    }
  });
  it("should return success if an OTP has been generated", async () => {
    await successImpl();
  });
});
