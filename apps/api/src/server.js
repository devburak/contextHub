const fastify = require('fastify');
const fp = require('fastify-plugin');
const jwt = require('@fastify/jwt');
const dotenv = require('dotenv');
const path = require('path');
const { database } = require('@contexthub/common');

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
  await app.register(jwtPlugin);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Example protected route
  app.get('/protected', { preHandler: [app.authenticate] }, async (request) => {
    return { message: `Hello ${request.user?.sub || 'anonymous'}` };
  });

  // Example login route (stub).  In later phases this will validate against stored users.
  app.post('/login', async (request, reply) => {
    const { username } = request.body || {};
    if (!username) {
      return reply.code(400).send({ message: 'Username required' });
    }
    // Issue a token with a very simple payload.  Expiration and roles should be added later.
    const token = app.jwt.sign({ sub: username, role: ROLES.ADMIN }, { expiresIn: '1h' });
    return { token };
  });

  return app;
}

// Start the server if this file is run directly.  This allows `pnpm dev:api` to run the service.
async function start() {
  // Connect to MongoDB first
  await database.connectDB();
  
  const app = await buildServer();
  const port = process.env.PORT || 3000;
  try {
    await app.listen({ port: Number(port), host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = buildServer;
