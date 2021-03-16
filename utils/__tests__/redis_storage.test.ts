// tslint:disable: no-any

import { isNone } from "fp-ts/lib/Option";
import { deleteTask, getTask } from "../redis_storage";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";

const getMock = jest.fn().mockImplementation((_, cb) => cb(null, aRedisValue));
const delMock = jest.fn().mockImplementation((_, cb) => cb(null, 1));
const redisClientMock = {
  del: delMock,
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

describe("deleteTask", () => {
  it("should return true if key has been deleted from redis", async () => {
    await deleteTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        del => expect(del).toBeTruthy()
      )
      .run();
  });

  it("should return false if key does not exists in redis", async () => {
    delMock.mockImplementationOnce((_, cb) => cb(null, 0));
    await deleteTask(redisClientMock as any, aRedisKey)
      .fold(
        () => fail(),
        del => expect(del).toBeFalsy()
      )
      .run();
  });

  it("should return an error if redis delete fails", async () => {
    delMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot perform delete on redis"), null)
    );
    await deleteTask(redisClientMock as any, aRedisKey)
      .fold(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
      .run();
  });
});
