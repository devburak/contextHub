const upstashClient = require('../lib/upstash');

/**
 * Middleware to log API requests to Upstash Redis
 * Tracks: endpoint, tenantId, userId, IP, timestamp, response time
 * 
 * This runs on onResponse hook to ensure tenantContext has already set request.tenantId
 */
async function apiLogger(request, reply) {
  // Skip logging for health check and static files
  const skipPaths = ['/health', '/favicon.ico', '/robots.txt'];
  if (skipPaths.some(path => request.url.startsWith(path))) {
    return;
  }

  // Skip if Upstash is not enabled
  if (!upstashClient.isEnabled()) {
    return;
  }

  try {
    // Extract request information
    const endpoint = request.routeOptions?.url || request.url.split('?')[0];
    const method = request.method;
    const ip = request.headers['x-forwarded-for'] || 
               request.headers['x-real-ip'] || 
               request.socket.remoteAddress || 
               'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';
    
    // Get tenantId and userId from request (should be set by auth middleware now)
    const tenantId = request.tenantId || request.user?.tenantId || null;
    const userId = request.user?.id || null;
    
    // Get response info
    const statusCode = reply.statusCode;
    const responseTime = reply.getResponseTime ? reply.getResponseTime() : 0;

    console.log('[APILogger] Logging request:', {
      endpoint,
      tenantId: tenantId || 'system',
      userId,
      statusCode,
      hasTenantId: !!tenantId,
      requestTenantId: request.tenantId,
      userTenantId: request.user?.tenantId,
    });

    // Log to Upstash asynchronously (don't block response)
    setImmediate(() => {
      upstashClient.logRequest({
        tenantId,
        userId,
        endpoint,
        method,
        ip,
        userAgent,
        statusCode,
        responseTime,
      }).catch(error => {
        console.error('Failed to log API request:', error);
      });
    });
  } catch (error) {
    console.error('[APILogger] Error in apiLogger:', error);
  }
}

module.exports = apiLogger;
