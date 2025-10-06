const { PlacementDefinition } = require('@contexthub/common');
const micromatch = require('micromatch');
const { v4: uuidv4 } = require('uuid');

/**
 * Placement Decision Service
 * Core logic for selecting which experience to show
 */

/**
 * Make a decision: which experience should be shown?
 */
async function decide({ tenantId, placementSlug, context }) {
  try {
    // 1. Get placement definition
    const placement = await PlacementDefinition.findOne({
      tenantId,
      slug: placementSlug,
      status: 'active'
    }).lean();

    if (!placement) {
      return null;
    }

    // 2. Filter eligible experiences
    const eligible = filterEligibleExperiences(placement.experiences || [], context, placement.defaultRules);

    if (eligible.length === 0) {
      // Check for fallback experience
      if (placement.settings?.fallbackExperienceId) {
        const fallback = placement.experiences.find(
          exp => exp._id.toString() === placement.settings.fallbackExperienceId
        );
        if (fallback) {
          return buildDecision(placement, fallback, context);
        }
      }
      return null;
    }

    // 3. Sort by priority (higher = first)
    eligible.sort((a, b) => (b.priority || 50) - (a.priority || 50));

    // 4. A/B testing: weighted random selection
    const selected = weightedRandomSelection(eligible);

    if (!selected) {
      return null;
    }

    // 5. Build decision response
    return buildDecision(placement, selected, context);

  } catch (error) {
    console.error('Decision engine error:', error);
    return null;
  }
}

/**
 * Filter experiences based on targeting rules
 */
function filterEligibleExperiences(experiences, context, defaultRules = {}) {
  return experiences.filter(exp => {
    // Basic status check
    if (exp.status !== 'active') return false;

    // Merge default rules with experience rules
    const rules = {
      ...defaultRules,
      ...exp.rules
    };

    // Path matching
    if (!matchPaths(context.path, rules.paths, rules.pathMode)) {
      return false;
    }

    // Query parameters
    if (rules.query && !matchQuery(context.query, rules.query)) {
      return false;
    }

    // Locale
    if (rules.locales?.length && context.locale) {
      if (!rules.locales.includes(context.locale)) {
        return false;
      }
    }

    // Device
    if (rules.devices?.length && context.device) {
      if (!rules.devices.includes(context.device)) {
        return false;
      }
    }

    // Browser
    if (rules.browsers?.length && context.browser) {
      if (!rules.browsers.includes(context.browser)) {
        return false;
      }
    }

    // OS
    if (rules.os?.length && context.os) {
      if (!rules.os.includes(context.os)) {
        return false;
      }
    }

    // Authentication
    if (rules.authenticated !== null && rules.authenticated !== undefined) {
      if (rules.authenticated !== context.authenticated) {
        return false;
      }
    }

    // User roles
    if (rules.roles?.length && context.userRoles) {
      const hasRole = rules.roles.some(role => context.userRoles.includes(role));
      if (!hasRole) return false;
    }

    // User tags
    if (rules.userTags?.length && context.userTags) {
      const hasTag = rules.userTags.some(tag => context.userTags.includes(tag));
      if (!hasTag) return false;
    }

    // Feature flags - must have ALL required flags
    if (rules.requiredFlags?.length && context.featureFlags) {
      const hasAllFlags = rules.requiredFlags.every(flag => context.featureFlags.includes(flag));
      if (!hasAllFlags) return false;
    }

    // Exclude flags - must NOT have ANY exclude flags
    if (rules.excludeFlags?.length && context.featureFlags) {
      const hasExcludedFlag = rules.excludeFlags.some(flag => context.featureFlags.includes(flag));
      if (hasExcludedFlag) return false;
    }

    // Cookies
    if (rules.cookies && !matchCookies(context.cookies, rules.cookies)) {
      return false;
    }

    // Referrer
    if (rules.referrers?.length && context.referrer) {
      if (!micromatch.isMatch(context.referrer, rules.referrers)) {
        return false;
      }
    }

    if (rules.excludeReferrers?.length && context.referrer) {
      if (micromatch.isMatch(context.referrer, rules.excludeReferrers)) {
        return false;
      }
    }

    // Schedule
    if (rules.schedule && !isScheduleActive(rules.schedule, context.timezone)) {
      return false;
    }

    // Frequency capping (server-side validation)
    if (rules.frequency && !checkFrequencyCap(rules.frequency, context.seenCaps)) {
      return false;
    }

    return true;
  });
}

/**
 * Path matching with glob patterns
 */
function matchPaths(path, patterns, mode = 'include') {
  if (!patterns || patterns.length === 0) return true;

  const isMatch = micromatch.isMatch(path, patterns);
  return mode === 'include' ? isMatch : !isMatch;
}

/**
 * Query parameter matching
 */
function matchQuery(contextQuery = {}, ruleQuery = {}) {
  return Object.entries(ruleQuery).every(([key, value]) => {
    return contextQuery[key] === value;
  });
}

/**
 * Cookie matching
 */
function matchCookies(contextCookies = {}, cookieRules = {}) {
  // Check include rules
  if (cookieRules.include?.length) {
    const allIncludeMatch = cookieRules.include.every(rule => {
      return matchCookieRule(contextCookies, rule);
    });
    if (!allIncludeMatch) return false;
  }

  // Check exclude rules
  if (cookieRules.exclude?.length) {
    const anyExcludeMatch = cookieRules.exclude.some(rule => {
      return matchCookieRule(contextCookies, rule);
    });
    if (anyExcludeMatch) return false;
  }

  return true;
}

/**
 * Single cookie rule matching
 */
function matchCookieRule(cookies, rule) {
  const cookieValue = cookies[rule.key];
  
  switch (rule.operator) {
    case 'exists':
      return cookieValue !== undefined;
    case 'notExists':
      return cookieValue === undefined;
    case 'equals':
      return cookieValue === rule.value;
    case 'notEquals':
      return cookieValue !== rule.value;
    case 'contains':
      return cookieValue?.includes(rule.value);
    case 'notContains':
      return !cookieValue?.includes(rule.value);
    case 'startsWith':
      return cookieValue?.startsWith(rule.value);
    case 'endsWith':
      return cookieValue?.endsWith(rule.value);
    default:
      return false;
  }
}

/**
 * Check if schedule is currently active
 */
function isScheduleActive(schedule, timezone = 'UTC') {
  const now = new Date();

  // Date range check
  if (schedule.startAt && new Date(schedule.startAt) > now) {
    return false;
  }
  if (schedule.endAt && new Date(schedule.endAt) < now) {
    return false;
  }

  // Day of week check
  if (schedule.daysOfWeek?.length) {
    const currentDay = now.getDay(); // 0=Sunday, 6=Saturday
    if (!schedule.daysOfWeek.includes(currentDay)) {
      return false;
    }
  }

  // Hour of day check
  if (schedule.hoursOfDay?.length) {
    const currentHour = now.getHours();
    if (!schedule.hoursOfDay.includes(currentHour)) {
      return false;
    }
  }

  // Exclude dates check
  if (schedule.excludeDates?.length) {
    const todayStr = now.toISOString().split('T')[0];
    const isExcluded = schedule.excludeDates.some(date => {
      const excludeStr = new Date(date).toISOString().split('T')[0];
      return excludeStr === todayStr;
    });
    if (isExcluded) return false;
  }

  return true;
}

/**
 * Check frequency cap (server-side validation)
 */
function checkFrequencyCap(frequency, seenCaps = {}) {
  if (!frequency.capKey) return true;

  const capKey = frequency.capKey;
  const currentCount = seenCaps[capKey] || 0;

  // Check session cap
  if (frequency.maxPerSession !== undefined && currentCount >= frequency.maxPerSession) {
    return false;
  }

  // Check daily cap (requires date-based key from client)
  const todayKey = `${capKey}:${new Date().toISOString().split('T')[0]}`;
  const todayCount = seenCaps[todayKey] || 0;
  if (frequency.maxPerDay !== undefined && todayCount >= frequency.maxPerDay) {
    return false;
  }

  // Check total cap
  if (frequency.maxTotal !== undefined) {
    const totalKey = `${capKey}:total`;
    const totalCount = seenCaps[totalKey] || 0;
    if (totalCount >= frequency.maxTotal) {
      return false;
    }
  }

  return true;
}

/**
 * Weighted random selection for A/B testing
 */
function weightedRandomSelection(experiences) {
  if (experiences.length === 0) return null;
  if (experiences.length === 1) return experiences[0];

  // Calculate total weight
  const totalWeight = experiences.reduce((sum, exp) => {
    return sum + (exp.weight || 100);
  }, 0);

  // Random selection
  let random = Math.random() * totalWeight;
  
  for (const exp of experiences) {
    random -= (exp.weight || 100);
    if (random <= 0) {
      return exp;
    }
  }

  // Fallback to first
  return experiences[0];
}

/**
 * Build decision response
 */
function buildDecision(placement, experience, context) {
  const trackingId = uuidv4();

  return {
    placementId: placement._id.toString(),
    experienceId: experience._id.toString(),
    contentType: experience.contentType,
    payload: experience.payload,
    ui: experience.ui || {},
    tracking: {
      placementId: placement._id.toString(),
      experienceId: experience._id.toString(),
      sessionId: context.sessionId,
      trackingId,
      variantWeight: experience.weight || 100,
      variantPriority: experience.priority || 50,
      capKey: experience.rules?.frequency?.capKey || placement.defaultRules?.frequency?.capKey
    },
    meta: {
      placementSlug: placement.slug,
      placementName: placement.name,
      experienceName: experience.name,
      category: placement.category
    }
  };
}

/**
 * Get multiple placements at once (batch decision)
 */
async function decideBatch({ tenantId, placements, context }) {
  const decisions = await Promise.all(
    placements.map(slug => decide({ tenantId, placementSlug: slug, context }))
  );

  return placements.reduce((acc, slug, index) => {
    if (decisions[index]) {
      acc[slug] = decisions[index];
    }
    return acc;
  }, {});
}

module.exports = {
  decide,
  decideBatch,
  filterEligibleExperiences,
  matchPaths,
  isScheduleActive,
  checkFrequencyCap,
  weightedRandomSelection
};
