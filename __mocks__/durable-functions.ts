import { Context } from "@azure/functions";

export const mockStartNew = jest.fn();

export const getClient = jest.fn(() => ({
  startNew: mockStartNew
}));

export const orchestrator = jest.fn();

export const RetryOptions = jest.fn(() => ({}));

export const context = ({
  bindings: {},
  log: {
    // eslint-disable-next-line no-console
    error: jest.fn().mockImplementation(console.log),
    // eslint-disable-next-line no-console
    info: jest.fn().mockImplementation(console.log),
    // eslint-disable-next-line no-console
    verbose: jest.fn().mockImplementation(console.log),
    // eslint-disable-next-line no-console
    warn: jest.fn().mockImplementation(console.log)
  },
  // eslint-disable-next-line sort-keys
  executionContext: {
    invocationId: "123456"
  }
} as unknown) as Context;
