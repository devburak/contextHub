const crypto = require("crypto");

const ORIGIN_SECRET_HEADER = "x-ctx-origin-secret";
const MIN_ORIGIN_SECRET_BYTES = 32;

function envFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function resolveOriginProtectionConfig(env = process.env) {
  const isProduction = env.NODE_ENV === "production";
  const enabled = envFlag(env.ORIGIN_PROTECTION_ENABLED, isProduction);

  if (isProduction && !enabled) {
    throw new Error(
      "ORIGIN_PROTECTION_ENABLED cannot be disabled in production. Refusing to start.",
    );
  }

  if (!enabled) {
    return { enabled: false, secret: null };
  }

  const secret = env.ORIGIN_SHARED_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_ORIGIN_SECRET_BYTES) {
    throw new Error(
      `ORIGIN_SHARED_SECRET must be set to at least ${MIN_ORIGIN_SECRET_BYTES} bytes when origin protection is enabled.`,
    );
  }

  return { enabled: true, secret };
}

function timingSafeSecretEqual(provided, expected) {
  if (typeof provided !== "string") {
    return false;
  }

  const providedDigest = crypto
    .createHash("sha256")
    .update(provided, "utf8")
    .digest();
  const expectedDigest = crypto
    .createHash("sha256")
    .update(expected, "utf8")
    .digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

function createOriginProtectionHook(env = process.env) {
  const config = resolveOriginProtectionConfig(env);

  return async function verifyOriginRequest(request, reply) {
    if (!config.enabled) {
      return;
    }

    const provided = request.headers[ORIGIN_SECRET_HEADER];
    if (!timingSafeSecretEqual(provided, config.secret)) {
      const pathname = String(request.url || "").split("?", 1)[0];
      request.log.warn(
        { pathname, ip: request.ip },
        "Blocked request without a valid origin credential",
      );
      return reply.code(403).header("Cache-Control", "private, no-store").send({
        error: "OriginAccessDenied",
        message: "Request rejected by origin policy.",
      });
    }

    // Downstream routes, plugins and application logs do not need the credential.
    delete request.headers[ORIGIN_SECRET_HEADER];
  };
}

module.exports = {
  MIN_ORIGIN_SECRET_BYTES,
  ORIGIN_SECRET_HEADER,
  createOriginProtectionHook,
  resolveOriginProtectionConfig,
  timingSafeSecretEqual,
};
