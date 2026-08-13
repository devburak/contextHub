import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fastify = require("fastify");
const {
  createOriginProtectionHook,
  isPublicProbePath,
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
  app.get("/ready", async () => ({ status: "ready" }));
  app.get("/api/private", async () => ({ status: "ok" }));
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

  it("matches probe paths exactly while allowing query strings", () => {
    expect(isPublicProbePath("/ready?source=lb")).toBe(true);
    expect(isPublicProbePath("/health/details")).toBe(false);
  });

  it("allows liveness and readiness probes without a secret", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      ORIGIN_PROTECTION_ENABLED: "true",
      ORIGIN_SHARED_SECRET: TEST_SECRET,
    });

    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready?probe=1" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });
  });

  it("blocks an incorrect secret", async () => {
    const app = await buildApp({
      NODE_ENV: "production",
      ORIGIN_PROTECTION_ENABLED: "true",
      ORIGIN_SHARED_SECRET: TEST_SECRET,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/private",
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
      url: "/api/private",
      headers: { "x-ctx-origin-secret": TEST_SECRET },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
