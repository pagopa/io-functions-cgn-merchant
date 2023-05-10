// eslint-disable @typescript-eslint/no-explicit-any

import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { existsKeyTask, getTask, deleteTask } from "../redis_storage";
import { RedisClient, RedisClientFactory } from "../redis";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";

const delMock = jest.fn().mockResolvedValue(1);
const getMock = jest.fn().mockResolvedValue(aRedisValue);
const existsMock = jest.fn().mockResolvedValue(1);

const redisClientMock = ({
  DEL: delMock,
  EXISTS: existsMock,
  GET: getMock
} as unknown) as RedisClient;

const redisClientFactoryMock = {
  getInstance: async () => redisClientMock
} as RedisClientFactory;

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", async () => {
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        O.fold(
          () => fail(),
          value => expect(value).toEqual(aRedisValue)
        )
      )
    )();
  });

  it("should return none if no value was found for the provided key", async () => {
    getMock.mockImplementationOnce(_ => Promise.resolve(undefined));
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(O.isNone(maybeResult)).toBeTruthy()
      )
    )();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockImplementationOnce(_ =>
      Promise.reject(new Error("Cannot get value"))
    );
    await pipe(
      getTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("existsTask", () => {
  it("should return true if key exists in redis", async () => {
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeTruthy()
      )
    )();
  });

  it("should return false if key does not exists in redis", async () => {
    existsMock.mockImplementationOnce(_ => Promise.resolve(0));
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        () => fail(),
        exists => expect(exists).toBeFalsy()
      )
    )();
  });

  it("should return an error if redis exists fails", async () => {
    existsMock.mockImplementationOnce(_ =>
      Promise.reject(new Error("Cannot recognize exists on redis"))
    );
    await pipe(
      existsKeyTask(redisClientFactoryMock, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
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
