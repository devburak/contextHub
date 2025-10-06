const { PlacementEvent, PlacementDefinition } = require('@contexthub/common');
const mongoose = require('mongoose');

/**
 * Placement Analytics Service
 * High-level analytics and reporting for placements
 */

/**
 * Get comprehensive stats for a placement
 */
async function getPlacementStats({
  tenantId,
  placementId,
  experienceId = null,
  startDate,
  endDate,
  groupBy = 'day'
}) {
  try {
    const stats = await PlacementEvent.getPlacementStats({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      experienceId: experienceId ? new mongoose.Types.ObjectId(experienceId) : null,
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default: last 30 days
      endDate: endDate || new Date(),
      groupBy
    });

    // Calculate rates
    return stats.map(s => ({
      ...s,
      viewRate: s.impressions ? ((s.views / s.impressions) * 100).toFixed(2) : 0,
      clickRate: s.impressions ? ((s.clicks / s.impressions) * 100).toFixed(2) : 0,
      conversionRate: s.impressions ? ((s.conversions / s.impressions) * 100).toFixed(2) : 0,
      closeRate: s.impressions ? ((s.closes / s.impressions) * 100).toFixed(2) : 0
    }));
  } catch (error) {
    console.error('Failed to get placement stats:', error);
    throw error;
  }
}

/**
 * Get aggregated totals for a placement
 */
async function getPlacementTotals({
  tenantId,
  placementId,
  experienceId = null,
  startDate,
  endDate
}) {
  try {
    const match = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      timestamp: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date()
      }
    };

    if (experienceId) {
      match.experienceId = new mongoose.Types.ObjectId(experienceId);
    }

    const result = await PlacementEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalValue: { $sum: '$conversionValue' },
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);

    const totals = {
      impressions: 0,
      views: 0,
      clicks: 0,
      conversions: 0,
      closes: 0,
      dismissals: 0,
      submits: 0,
      errors: 0,
      totalRevenue: 0,
      avgDuration: 0
    };

    result.forEach(r => {
      totals[r._id + 's'] = r.count;
      if (r._id === 'conversion') {
        totals.totalRevenue = r.totalValue || 0;
      }
      if (r.avgDuration) {
        totals.avgDuration = Math.round(r.avgDuration);
      }
    });

    // Calculate rates
    if (totals.impressions > 0) {
      totals.viewRate = ((totals.views / totals.impressions) * 100).toFixed(2);
      totals.clickRate = ((totals.clicks / totals.impressions) * 100).toFixed(2);
      totals.conversionRate = ((totals.conversions / totals.impressions) * 100).toFixed(2);
      totals.closeRate = ((totals.closes / totals.impressions) * 100).toFixed(2);
    }

    return totals;
  } catch (error) {
    console.error('Failed to get placement totals:', error);
    throw error;
  }
}

/**
 * Get conversion funnel
 */
async function getConversionFunnel({
  tenantId,
  placementId,
  experienceId,
  startDate,
  endDate
}) {
  try {
    const result = await PlacementEvent.getConversionFunnel({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      experienceId: new mongoose.Types.ObjectId(experienceId),
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: endDate || new Date()
    });

    if (!result || result.length === 0) {
      return {
        totalSessions: 0,
        steps: []
      };
    }

    const data = result[0];
    const steps = [
      {
        name: 'Impression',
        count: data.impressions || 0,
        rate: 100,
        dropOff: 0
      },
      {
        name: 'View',
        count: data.views || 0,
        rate: data.impressions ? ((data.views / data.impressions) * 100).toFixed(2) : 0,
        dropOff: data.impressions ? (((data.impressions - data.views) / data.impressions) * 100).toFixed(2) : 0
      },
      {
        name: 'Click',
        count: data.clicks || 0,
        rate: data.views ? ((data.clicks / data.views) * 100).toFixed(2) : 0,
        dropOff: data.views ? (((data.views - data.clicks) / data.views) * 100).toFixed(2) : 0
      },
      {
        name: 'Conversion',
        count: data.conversions || 0,
        rate: data.clicks ? ((data.conversions / data.clicks) * 100).toFixed(2) : 0,
        dropOff: data.clicks ? (((data.clicks - data.conversions) / data.clicks) * 100).toFixed(2) : 0
      }
    ];

    return {
      totalSessions: data.totalSessions || 0,
      steps
    };
  } catch (error) {
    console.error('Failed to get conversion funnel:', error);
    throw error;
  }
}

/**
 * Get user journey
 */
async function getUserJourney({ tenantId, sessionId, userKey }) {
  try {
    const journey = await PlacementEvent.getUserJourney({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      sessionId,
      userKey
    });

    return journey;
  } catch (error) {
    console.error('Failed to get user journey:', error);
    throw error;
  }
}

/**
 * Get A/B test results comparison
 */
async function getABTestResults({
  tenantId,
  placementId,
  startDate,
  endDate
}) {
  try {
    const placement = await PlacementDefinition.findOne({
      _id: placementId,
      tenantId
    }).lean();

    if (!placement) {
      throw new Error('Placement not found');
    }

    // Get stats for each experience
    const experiences = placement.experiences || [];
    const results = await Promise.all(
      experiences.map(async (exp) => {
        const stats = await getPlacementTotals({
          tenantId,
          placementId,
          experienceId: exp._id.toString(),
          startDate,
          endDate
        });

        return {
          experienceId: exp._id.toString(),
          name: exp.name,
          weight: exp.weight || 100,
          priority: exp.priority || 50,
          status: exp.status,
          ...stats
        };
      })
    );

    // Find winner (highest conversion rate)
    const winner = results.reduce((best, current) => {
      const currentRate = parseFloat(current.conversionRate || 0);
      const bestRate = parseFloat(best.conversionRate || 0);
      return currentRate > bestRate ? current : best;
    }, results[0] || {});

    return {
      placement: {
        id: placement._id.toString(),
        name: placement.name,
        slug: placement.slug
      },
      experiences: results,
      winner: winner ? {
        experienceId: winner.experienceId,
        name: winner.name,
        conversionRate: winner.conversionRate
      } : null,
      totalImpressions: results.reduce((sum, r) => sum + r.impressions, 0),
      totalConversions: results.reduce((sum, r) => sum + r.conversions, 0)
    };
  } catch (error) {
    console.error('Failed to get A/B test results:', error);
    throw error;
  }
}

/**
 * Get device breakdown
 */
async function getDeviceBreakdown({
  tenantId,
  placementId,
  experienceId = null,
  startDate,
  endDate
}) {
  try {
    const match = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      timestamp: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date()
      }
    };

    if (experienceId) {
      match.experienceId = new mongoose.Types.ObjectId(experienceId);
    }

    const result = await PlacementEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            device: '$device',
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.device',
          impressions: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'impression'] }, '$count', 0] }
          },
          clicks: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'click'] }, '$count', 0] }
          },
          conversions: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'conversion'] }, '$count', 0] }
          }
        }
      },
      { $sort: { impressions: -1 } }
    ]);

    return result.map(r => ({
      device: r._id || 'unknown',
      impressions: r.impressions || 0,
      clicks: r.clicks || 0,
      conversions: r.conversions || 0,
      clickRate: r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(2) : 0,
      conversionRate: r.impressions ? ((r.conversions / r.impressions) * 100).toFixed(2) : 0
    }));
  } catch (error) {
    console.error('Failed to get device breakdown:', error);
    throw error;
  }
}

/**
 * Get browser breakdown
 */
async function getBrowserBreakdown({
  tenantId,
  placementId,
  experienceId = null,
  startDate,
  endDate
}) {
  try {
    const match = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      timestamp: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date()
      }
    };

    if (experienceId) {
      match.experienceId = new mongoose.Types.ObjectId(experienceId);
    }

    const result = await PlacementEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            browser: '$browser',
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.browser',
          impressions: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'impression'] }, '$count', 0] }
          },
          clicks: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'click'] }, '$count', 0] }
          },
          conversions: {
            $sum: { $cond: [{ $eq: ['$_id.type', 'conversion'] }, '$count', 0] }
          }
        }
      },
      { $sort: { impressions: -1 } }
    ]);

    return result.map(r => ({
      browser: r._id || 'unknown',
      impressions: r.impressions || 0,
      clicks: r.clicks || 0,
      conversions: r.conversions || 0,
      clickRate: r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(2) : 0,
      conversionRate: r.impressions ? ((r.conversions / r.impressions) * 100).toFixed(2) : 0
    }));
  } catch (error) {
    console.error('Failed to get browser breakdown:', error);
    throw error;
  }
}

/**
 * Get top performing pages
 */
async function getTopPages({
  tenantId,
  placementId,
  experienceId = null,
  startDate,
  endDate,
  limit = 10
}) {
  try {
    const match = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      type: 'conversion',
      timestamp: {
        $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        $lte: endDate || new Date()
      }
    };

    if (experienceId) {
      match.experienceId = new mongoose.Types.ObjectId(experienceId);
    }

    const result = await PlacementEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$path',
          conversions: { $sum: 1 },
          totalValue: { $sum: '$conversionValue' }
        }
      },
      { $sort: { conversions: -1 } },
      { $limit: limit }
    ]);

    return result.map(r => ({
      path: r._id,
      conversions: r.conversions,
      revenue: r.totalValue || 0
    }));
  } catch (error) {
    console.error('Failed to get top pages:', error);
    throw error;
  }
}

/**
 * Get real-time stats (last hour)
 */
async function getRealTimeStats({ tenantId, placementId }) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const stats = await getPlacementTotals({
      tenantId,
      placementId,
      startDate: oneHourAgo,
      endDate: new Date()
    });

    // Get active sessions
    const activeSessions = await PlacementEvent.distinct('sessionId', {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      placementId: new mongoose.Types.ObjectId(placementId),
      timestamp: { $gte: oneHourAgo }
    });

    return {
      ...stats,
      activeSessions: activeSessions.length,
      timeWindow: 'last_hour'
    };
  } catch (error) {
    console.error('Failed to get real-time stats:', error);
    throw error;
  }
}

module.exports = {
  getPlacementStats,
  getPlacementTotals,
  getConversionFunnel,
  getUserJourney,
  getABTestResults,
  getDeviceBreakdown,
  getBrowserBreakdown,
  getTopPages,
  getRealTimeStats
};
