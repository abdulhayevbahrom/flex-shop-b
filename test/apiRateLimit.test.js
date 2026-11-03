import assert from "node:assert/strict";
import test from "node:test";
import { createApiRateLimit } from "../src/middleware/apiRateLimit.js";

function responseStub() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(name, value); },
  };
}

test("API rate limit allows requests up to the configured maximum", () => {
  const middleware = createApiRateLimit({ windowMs: 60_000, maxRequests: 2, clock: () => 1_000 });
  const req = { ip: "127.0.0.1" };

  for (let index = 0; index < 2; index += 1) {
    let error;
    middleware(req, responseStub(), (value) => { error = value; });
    assert.equal(error, undefined);
  }

  const res = responseStub();
  let error;
  middleware(req, res, (value) => { error = value; });
  assert.equal(error.statusCode, 429);
  assert.equal(error.code, "TOO_MANY_REQUESTS");
  assert.equal(res.headers.get("Retry-After"), "60");
});

test("API rate limit resets after its time window", () => {
  let now = 1_000;
  const middleware = createApiRateLimit({ windowMs: 1_000, maxRequests: 1, clock: () => now });
  const req = { ip: "127.0.0.1" };

  middleware(req, responseStub(), () => {});
  let error;
  middleware(req, responseStub(), (value) => { error = value; });
  assert.equal(error.statusCode, 429);

  now = 2_001;
  error = undefined;
  middleware(req, responseStub(), (value) => { error = value; });
  assert.equal(error, undefined);
});

test("API rate limit can be disabled with zero requests", () => {
  const middleware = createApiRateLimit({ windowMs: 1_000, maxRequests: 0 });
  let calls = 0;
  middleware({ ip: "127.0.0.1" }, responseStub(), () => { calls += 1; });
  assert.equal(calls, 1);
});

test("API rate limit supports a verified-user key", () => {
  const middleware = createApiRateLimit({
    windowMs: 60_000,
    maxRequests: 1,
    clock: () => 1_000,
    keyGenerator: (req) => req.user.telegramId,
  });

  let firstError;
  middleware({ user: { telegramId: "1" } }, responseStub(), (value) => { firstError = value; });
  let secondUserError;
  middleware({ user: { telegramId: "2" } }, responseStub(), (value) => { secondUserError = value; });
  assert.equal(firstError, undefined);
  assert.equal(secondUserError, undefined);

  let repeatedUserError;
  middleware({ user: { telegramId: "1" } }, responseStub(), (value) => { repeatedUserError = value; });
  assert.equal(repeatedUserError.code, "TOO_MANY_REQUESTS");
});
