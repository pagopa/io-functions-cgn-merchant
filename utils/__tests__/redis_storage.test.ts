// eslint-disable @typescript-eslint/no-explicit-any

import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { existsKeyTask, getTask, deleteTask } from "../redis_storage";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";

const delMock = jest.fn().mockImplementation(_ => 1);
const getMock = jest.fn().mockImplementation(_ => aRedisValue);
const existsMock = jest.fn().mockImplementation(_ => 1);
const redisClientMock = {
  del: delMock,
  exists: existsMock,
  get: getMock
};

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", () => {
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        O.fold(
          () => fail(),
          value => expect(value).toEqual(aRedisValue)
        )
      )
    );
  });

  it("should return none if no value was found for the provided key", () => {
    getMock.mockImplementationOnce(_ => undefined);
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(O.isNone(maybeResult)).toBeTruthy()
      )
    );
  });

  it("should return an error if redis get value fails", () => {
    getMock.mockImplementationOnce(_ => new Error("Cannot get value"));
    pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    );
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", () => {
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
    );
  });

  it("should return false if key does not exists in redis", () => {
    existsMock.mockImplementationOnce(_ => 0);
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
    );
  });

  it("should return an error if redis exists fails", () => {
    existsMock.mockImplementationOnce(
      _ => new Error("Cannot recognize exists on redis")
    );
    pipe(
      existsKeyTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    );
  });
});

describe("deleteTask", () => {
  it("should return true if key has been deleted from redis", () => {
    pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        del => expect(del).toBeTruthy()
      )
    );
  });

  it("should return false if key does not exists in redis", () => {
    delMock.mockImplementationOnce(_ => null);
    pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        del => expect(del).toBeFalsy()
      )
    );
  });

  it("should return an error if redis delete fails", () => {
    delMock.mockImplementationOnce(
      _ => new Error("Cannot perform delete on redis")
    );
    pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    );
  });
});
