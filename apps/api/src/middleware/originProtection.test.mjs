import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fastify = require("fastify");
const {
  createOriginProtectionHook,
  resolveOriginProtectionConfig,
  timingSafeSecretEqual,
} = require("./originProtection");

const TEST_SECRET = "a-secure-origin-secret-with-at-least-32-bytes";
const apps = [];

async function buildApp(env) {
  const app = fastify({ logger: false });
  apps.push(app);
  app.addHook("onRequest", createOriginProtectionHook(env));
  app.get("/health", async (request) => ({
    status: "ok",
    secretVisibleToRoute: Boolean(request.headers["x-ctx-origin-secret"]),
  }));
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("originProtection", () => {
  it("stays disabled by default outside production", () => {
    expect(resolveOriginProtectionConfig({ NODE_ENV: "test" })).toEqual({
      enabled: false,
      secret: null,
    });
  });

  it("cannot be disabled in production", () => {
    expect(() =>
      resolveOriginProtectionConfig({
        NODE_ENV: "production",
        ORIGIN_PROTECTION_ENABLED: "false",
        ORIGIN_SHARED_SECRET: TEST_SECRET,
      }),
    ).toThrow("cannot be disabled in production");
  });

  it("refuses to start with a missing or short secret when enabled", () => {
    expect(() =>
      resolveOriginProtectionConfig({
        NODE_ENV: "production",
        ORIGIN_PROTECTION_ENABLED: "true",
      }),
    ).toThrow("ORIGIN_SHARED_SECRET");

    expect(() =>
      resolveOriginProtectionConfig({
        NODE_ENV: "production",
        ORIGIN_PROTECTION_ENABLED: "true",
        ORIGIN_SHARED_SECRET: "too-short",
      }),
    ).toThrow("at least 32 bytes");
  });

  it("uses a timing-safe fixed-length digest comparison", () => {
    expect(timingSafeSecretEqual(TEST_SECRET, TEST_SECRET)).toBe(true);
    expect(timingSafeSecretEqual("wrong", TEST_SECRET)).toBe(false);
    expect(timingSafeSecretEqual(undefined, TEST_SECRET)).toBe(false);
  });

  it("blocks health requests without a secret", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      ORIGIN_PROTECTION_ENABLED: "true",
      ORIGIN_SHARED_SECRET: TEST_SECRET,
    });

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(403);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json()).toMatchObject({ error: "OriginAccessDenied" });
  });

  it("blocks an incorrect secret", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      ORIGIN_PROTECTION_ENABLED: "true",
      ORIGIN_SHARED_SECRET: TEST_SECRET,
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-ctx-origin-secret": "incorrect-secret" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows a valid request and removes the credential before the route", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      ORIGIN_PROTECTION_ENABLED: "true",
      ORIGIN_SHARED_SECRET: TEST_SECRET,
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-ctx-origin-secret": TEST_SECRET },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      secretVisibleToRoute: false,
    });
  });
});
