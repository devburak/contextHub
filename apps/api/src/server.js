const fastify = require('fastify');
const fp = require('fastify-plugin');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const dotenv = require('dotenv');
const path = require('path');
const { database } = require('@contexthub/common');
const roleService = require('./services/roleService');
const apiLogger = require('./middleware/apiLogger');
const upstashClient = require('./lib/upstash');

// Load environment variables from a local .env file when present.  Production deployments should use secrets management instead.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Simple RBAC roles definition.  In later phases this will be replaced by a more robust implementation.
const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  VIEWER: 'viewer'
};

// JWT plugin wrapper.  Using fastify-plugin allows encapsulation while keeping clear separation of concerns.
const jwtPlugin = fp(async function (app) {
  const secret = process.env.JWT_SECRET || 'supersecret';
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

// Create the Fastify application
async function buildServer() {
  const app = fastify({ logger: true });

  // Register plugins
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
    credentials: true
  });
  await app.register(jwtPlugin);

  // Register API logger middleware (logs all requests to Upstash Redis)
  // Using onResponse hook to ensure tenantContext has run first
  app.addHook('onResponse', apiLogger);

  // Register routes with /api prefix
  await app.register(require('./routes/auth'), { prefix: '/api' });
  await app.register(require('./routes/users'), { prefix: '/api' });
  await app.register(require('./routes/tenants'), { prefix: '/api' });
  await app.register(require('./routes/tenantSettings'), { prefix: '/api' });
  await app.register(require('./routes/activities'), { prefix: '/api' });
  await app.register(require('./routes/media'), { prefix: '/api' });
  await app.register(require('./routes/categories'), { prefix: '/api' });
  await app.register(require('./routes/tags'), { prefix: '/api' });
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
  await app.register(require('./routes/dashboard'), { prefix: '/api' });

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
  
  // Initialize Upstash Redis client (after env vars are loaded)
  upstashClient.initialize();
  
  const app = await buildServer();
  const port = process.env.PORT || 3000;
  try {
    console.log(`Starting server on port ${port}...`);
    await app.listen({ port: Number(port), host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = buildServer;
