import { afterEach, describe, expect, it, vi } from "vitest";

const iyzicoProvider = await import("./iyzicoProvider.js");
const originalApiKey = process.env.IYZICO_API_KEY;
const originalSecretKey = process.env.IYZICO_SECRET_KEY;
const originalEnvironment = process.env.IYZICO_ENV;

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.IYZICO_API_KEY;
  else process.env.IYZICO_API_KEY = originalApiKey;
  if (originalSecretKey === undefined) delete process.env.IYZICO_SECRET_KEY;
  else process.env.IYZICO_SECRET_KEY = originalSecretKey;
  if (originalEnvironment === undefined) delete process.env.IYZICO_ENV;
  else process.env.IYZICO_ENV = originalEnvironment;
});

describe("iyzico checkout transport error", () => {
  it("returns a provider network error without retrying an ambiguous initialize request", async () => {
    process.env.IYZICO_API_KEY = "test-api-key";
    process.env.IYZICO_SECRET_KEY = "test-secret-key";
    process.env.IYZICO_ENV = "live";
    const cause = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause });
    });

    await expect(
      iyzicoProvider.default.iyzicoRequest(
        "/v2/subscription/checkoutform/initialize",
        {
          method: "POST",
          body: {},
          fetchImpl,
        },
      ),
    ).rejects.toMatchObject({
      code: "BillingProviderNetworkUnavailable",
      statusCode: 503,
      cause: { cause: { code: "ECONNRESET" } },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
