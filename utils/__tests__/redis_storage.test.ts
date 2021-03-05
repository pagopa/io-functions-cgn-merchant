// tslint:disable: no-any

import { isNone } from "fp-ts/lib/Option";
import { existsKeyTask, getTask } from "../redis_storage";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";

const getMock = jest.fn().mockImplementation((_, cb) => cb(null, aRedisValue));
const existsMock = jest.fn().mockImplementation((_, cb) => cb(null, 1));
const redisClientMock = {
  exists: existsMock,
  get: getMock
};

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", async () => {
    await getTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        maybeResult =>
          maybeResult.foldL(
            () => fail(),
            value => expect(value).toEqual(aRedisValue)
          )
      )
      .run();
  });

  it("should return none if no value was found for the provided key", async () => {
    getMock.mockImplementationOnce((_, cb) => cb(undefined, null));
    await getTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        maybeResult => expect(isNone(maybeResult)).toBeTruthy()
      )
      .run();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot get value"), null)
    );
    await getTask(redisClientMock as any, aRedisKey)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", async () => {
    await existsKeyTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
      .run();
  });

  it("should return false if key does not exists in redis", async () => {
    existsMock.mockImplementationOnce((_, cb) => cb(null, 0));
    await existsKeyTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
      .run();
  });

  it("should return an error if redis exists fails", async () => {
    existsMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot recognize exists on redis"), null)
    );
    await existsKeyTask(redisClientMock as any, aRedisKey)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });
});
