const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const { tenantContext, authenticateWithoutTenant } = require('../middleware/auth');

/**
 * Subscription Plan Management Routes
 * Admin-only endpoints for managing subscription plans
 */
async function subscriptionPlanRoutes(fastify) {

  // Add tenant context to specific routes that need it
  // We'll manually add tenantContext to routes that require tenant
  // The /subscription-plans GET endpoint is excluded as it needs to work without tenant

  /**
   * GET /subscription-plans
   * List all subscription plans
   * PUBLIC: This endpoint is accessible to all authenticated users
   * (including those without a tenant) so they can view plans when creating a new tenant
   */
  fastify.get('/subscription-plans', {
    preHandler: [authenticateWithoutTenant],
  }, async function listPlansHandler(request, reply) {
    try {
      // This endpoint is now public to all authenticated users
      // No role check required - new users need to see plans to create their first tenant

      const plans = await SubscriptionPlan.getActivePlans();
      
      return reply.send({
        plans: plans.map(plan => ({
          id: plan._id,
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          billingType: plan.billingType,
          limits: {
            users: plan.userLimit,
            owners: plan.ownerLimit,
            storage: plan.storageLimit,
            requests: plan.monthlyRequestLimit,
          },
          formattedLimits: {
            storage: plan.formatStorageLimit(),
            requests: plan.formatRequestLimit(),
          },
          isActive: plan.isActive,
        })),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list subscription plans');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to list subscription plans',
      });
    }
  });

  /**
   * GET /subscription-plans/:slug
   * Get a single plan by slug
   */
  fastify.get('/subscription-plans/:slug', {
    preHandler: [tenantContext, fastify.authenticate],
  }, async function getPlanHandler(request, reply) {
    try {
      const { slug } = request.params;
      
      const plan = await SubscriptionPlan.getPlanBySlug(slug);
      
      if (!plan) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Subscription plan not found',
        });
      }

      return reply.send({
        plan: {
          id: plan._id,
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          billingType: plan.billingType,
          limits: {
            users: plan.userLimit,
            owners: plan.ownerLimit,
            storage: plan.storageLimit,
            requests: plan.monthlyRequestLimit,
          },
          enterprisePricing: {
            perGBStorage: plan.pricePerGBStorage,
            perThousandRequests: plan.pricePerThousandRequests,
          },
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get subscription plan');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to get subscription plan',
      });
    }
  });

  /**
   * PUT /subscription-plans/:slug
   * Update a subscription plan (owner only)
   */
  fastify.put('/subscription-plans/:slug', {
    preHandler: [tenantContext, fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          userLimit: { type: ['number', 'null'] },
          ownerLimit: { type: ['number', 'null'] },
          storageLimit: { type: 'number' },
          monthlyRequestLimit: { type: 'number' },
          pricePerGBStorage: { type: 'number' },
          pricePerThousandRequests: { type: 'number' },
          isActive: { type: 'boolean' },
          sortOrder: { type: 'number' },
        },
      },
    },
  }, async function updatePlanHandler(request, reply) {
    try {
      const { slug } = request.params;
      const userRole = request.user?.role;

      // Only owners can update plans
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can update subscription plans',
        });
      }

      const plan = await SubscriptionPlan.findOne({ slug });
      
      if (!plan) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Subscription plan not found',
        });
      }

      // Update fields
      const allowedFields = [
        'name', 'description', 'price', 
        'userLimit', 'ownerLimit', 'storageLimit', 'monthlyRequestLimit',
        'pricePerGBStorage', 'pricePerThousandRequests',
        'isActive', 'sortOrder',
      ];

      allowedFields.forEach(field => {
        if (request.body[field] !== undefined) {
          plan[field] = request.body[field];
        }
      });

      await plan.save();

      console.log(`[SubscriptionPlan] Updated plan: ${slug}`);

      return reply.send({
        message: 'Subscription plan updated successfully',
        plan: {
          id: plan._id,
          slug: plan.slug,
          name: plan.name,
          price: plan.price,
          limits: {
            users: plan.userLimit,
            owners: plan.ownerLimit,
            storage: plan.storageLimit,
            requests: plan.monthlyRequestLimit,
          },
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update subscription plan');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to update subscription plan',
      });
    }
  });

  /**
   * PUT /tenants/:tenantId/subscription
   * Update a tenant's subscription plan
   */
  fastify.put('/tenants/:tenantId/subscription', {
    preHandler: [tenantContext, fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          planSlug: { type: 'string' },
          customLimits: {
            type: 'object',
            properties: {
              userLimit: { type: ['number', 'null'] },
              ownerLimit: { type: ['number', 'null'] },
              storageLimit: { type: ['number', 'null'] },
              monthlyRequestLimit: { type: ['number', 'null'] },
            },
          },
        },
      },
    },
  }, async function updateTenantSubscriptionHandler(request, reply) {
    try {
      const { tenantId } = request.params;
      const { planSlug, customLimits } = request.body;
      const userRole = request.user?.role;

      // Only owners can update subscriptions
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can update tenant subscriptions',
        });
      }

      const Tenant = require('@contexthub/common/src/models/Tenant');
      const tenant = await Tenant.findById(tenantId);
      
      if (!tenant) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Tenant not found',
        });
      }

      // Update plan
      if (planSlug) {
        const plan = await SubscriptionPlan.getPlanBySlug(planSlug);
        if (!plan) {
          return reply.code(404).send({
            error: 'NotFound',
            message: 'Subscription plan not found',
          });
        }
        
        tenant.currentPlan = plan._id;
        tenant.subscriptionStartDate = new Date();
        tenant.billingCycleStart = new Date();
        
        console.log(`[Tenant] Updated subscription for ${tenantId} to ${planSlug}`);
      }

      // Update custom limits
      if (customLimits) {
        tenant.customLimits = {
          ...tenant.customLimits,
          ...customLimits,
        };
        
        console.log(`[Tenant] Updated custom limits for ${tenantId}:`, customLimits);
      }

      await tenant.save();

      // Invalidate cache
      const localRedisClient = require('../lib/localRedis');
      await localRedisClient.invalidateTenantCache(tenantId);

      return reply.send({
        message: 'Tenant subscription updated successfully',
        tenant: {
          id: tenant._id,
          name: tenant.name,
          currentPlan: tenant.currentPlan,
          customLimits: tenant.customLimits,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update tenant subscription');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to update tenant subscription',
      });
    }
  });

  /**
   * GET /tenants/:tenantId/limits
   * Get a tenant's current limits (effective limits after custom overrides)
   */
  fastify.get('/tenants/:tenantId/limits', {
    preHandler: [tenantContext, fastify.authenticate],
  }, async function getTenantLimitsHandler(request, reply) {
    try {
      const { tenantId } = request.params;
      
      const Tenant = require('@contexthub/common/src/models/Tenant');
      const tenant = await Tenant.findById(tenantId).populate('currentPlan');
      
      if (!tenant) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Tenant not found',
        });
      }

      // Check permission - only owner or members of the tenant
      const userRole = request.user?.role;
      const userTenantId = request.tenantId;
      
      if (userRole !== 'owner' && userTenantId !== tenantId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'You can only view limits for your own tenant',
        });
      }

      // Get effective limits
      const limits = {
        userLimit: await tenant.getLimit('userLimit'),
        ownerLimit: await tenant.getLimit('ownerLimit'),
        storageLimit: await tenant.getLimit('storageLimit'),
        monthlyRequestLimit: await tenant.getLimit('monthlyRequestLimit'),
      };

      // Get remaining quotas
      const remaining = {
        users: await tenant.getRemainingQuota('userLimit'),
        owners: await tenant.getRemainingQuota('ownerLimit'),
        storage: await tenant.getRemainingQuota('storageLimit'),
        requests: await tenant.getRemainingQuota('monthlyRequestLimit'),
      };

      return reply.send({
        tenant: {
          id: tenant._id,
          name: tenant.name,
        },
        plan: tenant.currentPlan ? {
          slug: tenant.currentPlan.slug,
          name: tenant.currentPlan.name,
          price: tenant.currentPlan.price,
        } : null,
        limits,
        currentUsage: tenant.currentUsage,
        remaining,
        customLimits: tenant.customLimits,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get tenant limits');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to get tenant limits',
      });
    }
  });

  /**
   * GET /tenants/current/limits
   * Get current tenant's limits (shortcut endpoint)
   */
  fastify.get('/tenants/current/limits', {
    preHandler: [tenantContext, fastify.authenticate],
  }, async function getCurrentTenantLimitsHandler(request, reply) {
    try {
      const userTenantId = request.tenantId;
      
      if (!userTenantId) {
        return reply.code(400).send({
          error: 'BadRequest',
          message: 'No active tenant found',
        });
      }

      const Tenant = require('@contexthub/common/src/models/Tenant');
      const Membership = require('@contexthub/common/src/models/Membership');
      
      const tenant = await Tenant.findById(userTenantId).populate('currentPlan');
      
      if (!tenant) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Tenant not found',
        });
      }

      // Get effective limits
      const limits = {
        userLimit: await tenant.getLimit('userLimit'),
        ownerLimit: await tenant.getLimit('ownerLimit'),
        storageLimit: await tenant.getLimit('storageLimit'),
        monthlyRequestLimit: await tenant.getLimit('monthlyRequestLimit'),
      };

      // Get actual usage counts from database
      const membershipCount = await Membership.countDocuments({ 
        tenantId: userTenantId,
        status: 'active',
      });
      
      const ownerCount = await Membership.countDocuments({ 
        tenantId: userTenantId,
        role: 'owner',
        status: 'active',
      });

      // Get storage usage from Media collection (exclude deleted files)
      const Media = require('@contexthub/common/src/models/Media');
      const mediaAgg = await Media.aggregate([
        { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
        { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } } } },
      ]);
      const storageUsed = mediaAgg.length > 0 ? mediaAgg[0].totalSize : 0;

      // Get monthly requests from Upstash (current month)
      const upstashClient = require('../lib/upstash');
      let monthlyRequests = 0;
      
      if (upstashClient.isEnabled()) {
        try {
          const stats = await upstashClient.getApiStats(userTenantId);
          monthlyRequests = stats.monthly || 0;
        } catch (error) {
          console.warn('[TenantLimits] Failed to get request stats:', error.message);
        }
      }

      // Calculate usage percentages and remaining
      const usage = {
        users: {
          current: membershipCount,
          limit: limits.userLimit,
          percentage: limits.userLimit ? Math.min(100, (membershipCount / limits.userLimit) * 100) : 0,
          remaining: limits.userLimit ? Math.max(0, limits.userLimit - membershipCount) : Infinity,
          isUnlimited: limits.userLimit === null || limits.userLimit === -1,
        },
        owners: {
          current: ownerCount,
          limit: limits.ownerLimit,
          percentage: limits.ownerLimit ? Math.min(100, (ownerCount / limits.ownerLimit) * 100) : 0,
          remaining: limits.ownerLimit ? Math.max(0, limits.ownerLimit - ownerCount) : Infinity,
          isUnlimited: limits.ownerLimit === null || limits.ownerLimit === -1,
        },
        storage: {
          current: storageUsed,
          limit: limits.storageLimit,
          percentage: limits.storageLimit ? Math.min(100, (storageUsed / limits.storageLimit) * 100) : 0,
          remaining: limits.storageLimit ? Math.max(0, limits.storageLimit - storageUsed) : Infinity,
          isUnlimited: limits.storageLimit === null || limits.storageLimit === -1,
        },
        requests: {
          current: monthlyRequests,
          limit: limits.monthlyRequestLimit,
          percentage: limits.monthlyRequestLimit ? Math.min(100, (monthlyRequests / limits.monthlyRequestLimit) * 100) : 0,
          remaining: limits.monthlyRequestLimit ? Math.max(0, limits.monthlyRequestLimit - monthlyRequests) : Infinity,
          isUnlimited: limits.monthlyRequestLimit === null || limits.monthlyRequestLimit === -1,
        },
      };

      return reply.send({
        tenant: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
        },
        plan: tenant.currentPlan ? {
          slug: tenant.currentPlan.slug,
          name: tenant.currentPlan.name,
          price: tenant.currentPlan.price,
          billingType: tenant.currentPlan.billingType,
        } : {
          slug: 'free',
          name: 'Free',
          price: 0,
          billingType: 'fixed',
        },
        usage,
        limits,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get current tenant limits');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to get tenant limits',
      });
    }
  });
}

module.exports = subscriptionPlanRoutes;
