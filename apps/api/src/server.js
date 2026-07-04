const fastify = require('fastify');
const fp = require('fastify-plugin');
const crypto = require('crypto');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const dotenv = require('dotenv');
const path = require('path');
const { database } = require('@contexthub/common');
const roleService = require('./services/roleService');
const tenantContext = require('@contexthub/common/src/tenantContext');
const apiLogger = require('./middleware/apiLogger');
const localRedisClient = require('./lib/localRedis');

// Load environment variables from a local .env file when present.  Production deployments should use secrets management instead.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function envList(name, defaultValue = '') {
  return (process.env[name] || defaultValue)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

// Minimum acceptable JWT secret length in bytes (256-bit).  Anything shorter is
// brute-forceable and rejected outright.
const MIN_JWT_SECRET_LENGTH = 32;

// Resolve the JWT signing secret.  Never fall back to a hardcoded/known value: a
// forgeable secret lets anyone mint owner/admin tokens for any tenant.  In production
// a strong secret is mandatory; in non-production we generate an ephemeral random
// secret (tokens reset on restart) so local dev works without shipping a known key.
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    if (secret.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length}).`
      );
    }
    return secret;
  }

  if (isProduction()) {
    throw new Error('JWT_SECRET must be set in production. Refusing to start with a default secret.');
  }

  const ephemeral = crypto.randomBytes(48).toString('hex');
  // eslint-disable-next-line no-console
  console.warn(
    '[security] JWT_SECRET is not set; generated an ephemeral secret for this process. ' +
    'Sessions will be invalidated on restart. Set JWT_SECRET for stable local sessions.'
  );
  return ephemeral;
}

// JWT plugin wrapper.  Using fastify-plugin allows encapsulation while keeping clear separation of concerns.
const jwtPlugin = fp(async function (app) {
  const secret = resolveJwtSecret();
  app.register(jwt, { secret });
  // Decorate request with a verify function.  This will be used to protect routes.
  app.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ message: 'Unauthorized' });
    }
  });
});

async function buildServer() {
  // trustProxy true ensures request.ip reflects real client IP when behind Nginx/ELB
  const bodyLimit = Number(process.env.API_BODY_LIMIT_BYTES) || 10 * 1024 * 1024;
  // Fastify's default maxParamLength is 100; long slugs (e.g. migrated `id-detail`
  // slugs) exceed it and make the router 404 on /contents/slug/:slug. Raise the ceiling
  // to 240 so those slugs resolve; anything longer still 404s at the router, which is
  // the intended cap.
  const maxParamLength = Number(process.env.API_MAX_PARAM_LENGTH) || 240;
  const app = fastify({ logger: true, trustProxy: true, bodyLimit, maxParamLength });

  // Register Swagger for OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ContextHub API',
        description: 'Multi-tenant headless CMS and content services platform API documentation',
        version: '0.1.0',
        contact: {
          name: 'ContextHub Support',
          email: 'support@contexthub.com'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: process.env.API_BASE_URL || 'http://localhost:3000',
          description: 'API Server'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token from /api/auth/login endpoint'
          },
          apiToken: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            description: 'API Token for Content-as-a-Service access. Format: Bearer ctx_your_token_here'
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key for public form submissions. Format: ctx_your_key_here'
          },
          tenantId: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Tenant-ID',
            description: 'Tenant ID for multi-tenant operations'
          }
        }
      },
      tags: [
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'users', description: 'User management' },
        { name: 'tenants', description: 'Tenant management' },
        { name: 'apiTokens', description: 'API Token management for Content-as-a-Service' },
        { name: 'content', description: 'Content management' },
        { name: 'media', description: 'Media management' },
        { name: 'categories', description: 'Category management' },
        { name: 'tags', description: 'Tag management' },
        { name: 'collections', description: 'Collection management' },
        { name: 'galleries', description: 'Gallery management' },
        { name: 'forms', description: 'Form management and form response handling' },
        { name: 'menus', description: 'Menu management' },
        { name: 'placements', description: 'Placement management' },
        { name: 'mail', description: 'Email services' },
        { name: 'roles', description: 'Role management' },
        { name: 'featureFlags', description: 'Feature flag management' },
        { name: 'subscriptionPlans', description: 'Subscription plan management' },
        { name: 'dashboard', description: 'Dashboard statistics' },
        { name: 'activities', description: 'Activity logging' },
        { name: 'documentation', description: 'Developer documentation' }
      ]
    }
  });

  // Register Swagger UI for interactive documentation
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    exposeRoute: true
  });

  // Register plugins
  const allowedOrigins = envList('CORS_ORIGIN');

  await app.register(cors, {
    origin: allowedOrigins.length ? allowedOrigins : !isProduction(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-API-Key'],
    credentials: true
  });
  await app.register(jwtPlugin);

  // Block direct IP access - requests must come through domain
  // This prevents bots/scanners hitting the server directly
  const strictHostCheck = envFlag('STRICT_HOST_CHECK', isProduction());
  const requireHttps = envFlag('REQUIRE_HTTPS', isProduction());
  const defaultAllowedHosts = isProduction() ? '' : 'localhost,127.0.0.1';
  const ALLOWED_HOSTS = new Set(
    envList('ALLOWED_HOSTS', defaultAllowedHosts).map(h => h.toLowerCase())
  );
  const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

  if (strictHostCheck && ALLOWED_HOSTS.size === 0) {
    throw new Error('ALLOWED_HOSTS must be configured when STRICT_HOST_CHECK is enabled.');
  }

  app.addHook('onRequest', (request, reply, done) => {
    const host = (request.headers.host || '').split(':')[0].toLowerCase();

    // Allow health checks and internal routes
    if (request.url === '/health' || request.url === '/ready') {
      return done();
    }

    if (requireHttps) {
      const forwardedProto = String(request.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      const protocol = forwardedProto || (request.raw.socket?.encrypted ? 'https' : 'http');

      if (protocol !== 'https') {
        request.log.warn({ host, protocol, ip: request.ip, url: request.url }, 'Blocked non-HTTPS API access');
        return reply.code(403).send({ error: 'HTTPS required' });
      }
    }

    // Block if host is an IP address (not domain)
    if (IP_REGEX.test(host)) {
      request.log.warn({ host, ip: request.ip, url: request.url }, 'Blocked direct IP access');
      return reply.code(403).send({ error: 'Direct IP access not allowed' });
    }

    // Block if host is not in allowed list (optional, can be disabled)
    if (ALLOWED_HOSTS.size > 0 && !ALLOWED_HOSTS.has(host)) {
      if (strictHostCheck) {
        request.log.warn({ host, ip: request.ip, url: request.url }, 'Blocked unknown host');
        return reply.code(403).send({ error: 'Unknown host' });
      }
    }

    done();
  });

  // Initialize async context per request for tenant scoping
  app.addHook('onRequest', (request, reply, done) => {
    tenantContext.run({}, done);
  });

  // Register API usage logger after tenant resolution
  app.addHook('onResponse', apiLogger);

  // Register routes with /api prefix
  await app.register(require('./routes/auth'), { prefix: '/api' });
  await app.register(require('./routes/users'), { prefix: '/api' });
  await app.register(require('./routes/tenants'), { prefix: '/api' });
  await app.register(require('./routes/tenantInfo'), { prefix: '/api' });
  await app.register(require('./routes/tenantSettings'), { prefix: '/api' });
  await app.register(require('./routes/activities'), { prefix: '/api' });
  await app.register(require('./routes/media'), { prefix: '/api' });
  await app.register(require('./routes/categories'), { prefix: '/api' });
  await app.register(require('./routes/tags'), { prefix: '/api' });
  await app.register(require('./routes/customFieldDefinitions'), { prefix: '/api' });
  await app.register(require('./routes/contents'), { prefix: '/api' });
  await app.register(require('./routes/forms'), { prefix: '/api' });
  await app.register(require('./routes/featureFlags'), { prefix: '/api' });
  await app.register(require('./routes/galleries'), { prefix: '/api' });
  await app.register(require('./routes/collections'), { prefix: '/api' });
  await app.register(require('./routes/mail'), { prefix: '/api' });
  await app.register(require('./routes/placements'), { prefix: '/api' });
  await app.register(require('./routes/menus'), { prefix: '/api' });
  await app.register(require('./routes/roles'), { prefix: '/api' });
  await app.register(require('./routes/publicCollections'), { prefix: '/api' });
  await app.register(require('./routes/publicForms'), { prefix: '/api' });
  await app.register(require('./routes/dashboard'), { prefix: '/api' });
  await app.register(require('./routes/apiUsageSync'), { prefix: '/api' });
  await app.register(require('./routes/subscriptionPlans'), { prefix: '/api' });
  await app.register(require('./routes/documentation'), { prefix: '/api' });
  await app.register(require('./routes/apiTokens'), { prefix: '/api' });
  await app.register(require('./routes/webhooks'), { prefix: '/api' });
  await app.register(require('./routes/cronWebhooks'), { prefix: '/api' });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  return app;
}

// Start the server if this file is run directly.  This allows `pnpm dev:api` to run the service.
async function start() {
  // Connect to MongoDB before starting the server
  await database.connectDB();
  await roleService.ensureSystemRoles();

  let usageStateRefreshPromise = null;
  const refreshUsageRuntimeState = async (reason) => {
    if (!localRedisClient.isEnabled()) {
      return;
    }

    if (usageStateRefreshPromise) {
      return usageStateRefreshPromise;
    }

    usageStateRefreshPromise = (async () => {
      try {
        console.log(`[Server] Refreshing usage runtime state (${reason})...`);
        const limitCheckerService = require('./services/limitCheckerService');
        const apiUsageService = require('./services/apiUsageService');
        const cleanupResult = await localRedisClient.cleanupLegacyLogs();
        console.log('[Server] Local Redis legacy usage cleanup result:', cleanupResult);
        await Promise.all([
          limitCheckerService.refreshAllLimitsCache(),
          apiUsageService.refreshAllTenantRequestStates(),
        ]);
        console.log('[Server] Usage runtime state refreshed');
      } catch (error) {
        console.error('[Server] Failed to refresh usage runtime state:', error.message);
      } finally {
        usageStateRefreshPromise = null;
      }
    })();

    return usageStateRefreshPromise;
  };

  localRedisClient.on('ready', ({ reconnected }) => {
    const reason = reconnected ? 'redis reconnected' : 'redis ready';
    void refreshUsageRuntimeState(reason);
  });

  await localRedisClient.initialize();
  
  const app = await buildServer();
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  try {
    console.log(`Starting server on ${host}:${port}...`);
    await app.listen({ port: Number(port), host });
    console.log(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = buildServer;
