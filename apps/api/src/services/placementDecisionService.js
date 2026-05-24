const { PlacementDefinition, FormDefinition } = require('@contexthub/common');
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
          return await buildDecision(placement, fallback, context);
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
    return await buildDecision(placement, selected, context);

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

function explainExperienceEligibility(experience, context, defaultRules = {}) {
  const reasons = [];

  if (experience.status !== 'active') {
    reasons.push({
      code: 'experience_inactive',
      label: 'Experience aktif değil',
      detail: `Durum: ${experience.status || 'unknown'}`
    });
  }

  const rules = {
    ...defaultRules,
    ...experience.rules
  };

  if (!matchPaths(context.path, rules.paths, rules.pathMode)) {
    reasons.push({
      code: 'path_mismatch',
      label: 'Path kuralı eşleşmedi',
      detail: `${context.path || '(empty)'} -> ${(rules.paths || []).join(', ')}`
    });
  }

  if (rules.query && !matchQuery(context.query, rules.query)) {
    reasons.push({
      code: 'query_mismatch',
      label: 'Query parametreleri eşleşmedi',
      detail: Object.keys(rules.query).join(', ')
    });
  }

  if (rules.locales?.length && context.locale && !rules.locales.includes(context.locale)) {
    reasons.push({
      code: 'locale_mismatch',
      label: 'Locale hedeflemesi eşleşmedi',
      detail: `${context.locale} beklenen: ${rules.locales.join(', ')}`
    });
  }

  if (rules.devices?.length && context.device && !rules.devices.includes(context.device)) {
    reasons.push({
      code: 'device_mismatch',
      label: 'Cihaz hedeflemesi eşleşmedi',
      detail: `${context.device} beklenen: ${rules.devices.join(', ')}`
    });
  }

  if (rules.browsers?.length && context.browser && !rules.browsers.includes(context.browser)) {
    reasons.push({
      code: 'browser_mismatch',
      label: 'Tarayıcı hedeflemesi eşleşmedi',
      detail: `${context.browser} beklenen: ${rules.browsers.join(', ')}`
    });
  }

  if (rules.os?.length && context.os && !rules.os.includes(context.os)) {
    reasons.push({
      code: 'os_mismatch',
      label: 'İşletim sistemi hedeflemesi eşleşmedi',
      detail: `${context.os} beklenen: ${rules.os.join(', ')}`
    });
  }

  if (rules.authenticated !== null && rules.authenticated !== undefined && rules.authenticated !== context.authenticated) {
    reasons.push({
      code: 'auth_mismatch',
      label: 'Oturum hedeflemesi eşleşmedi',
      detail: `Beklenen: ${rules.authenticated ? 'logged-in' : 'guest'}`
    });
  }

  if (rules.roles?.length && context.userRoles) {
    const hasRole = rules.roles.some(role => context.userRoles.includes(role));
    if (!hasRole) {
      reasons.push({
        code: 'role_mismatch',
        label: 'Rol hedeflemesi eşleşmedi',
        detail: `Beklenen roller: ${rules.roles.join(', ')}`
      });
    }
  }

  if (rules.userTags?.length && context.userTags) {
    const hasTag = rules.userTags.some(tag => context.userTags.includes(tag));
    if (!hasTag) {
      reasons.push({
        code: 'tag_mismatch',
        label: 'Kullanıcı etiketi eşleşmedi',
        detail: `Beklenen etiketler: ${rules.userTags.join(', ')}`
      });
    }
  }

  if (rules.requiredFlags?.length && context.featureFlags) {
    const missing = rules.requiredFlags.filter(flag => !context.featureFlags.includes(flag));
    if (missing.length) {
      reasons.push({
        code: 'feature_flag_missing',
        label: 'Feature flag eksik',
        detail: missing.join(', ')
      });
    }
  }

  if (rules.excludeFlags?.length && context.featureFlags) {
    const excluded = rules.excludeFlags.filter(flag => context.featureFlags.includes(flag));
    if (excluded.length) {
      reasons.push({
        code: 'feature_flag_excluded',
        label: 'Hariç tutulan feature flag mevcut',
        detail: excluded.join(', ')
      });
    }
  }

  if (rules.cookies && !matchCookies(context.cookies, rules.cookies)) {
    reasons.push({
      code: 'cookie_mismatch',
      label: 'Cookie kuralı eşleşmedi',
      detail: 'Include/exclude cookie kurallarını kontrol edin'
    });
  }

  if (rules.referrers?.length && context.referrer && !micromatch.isMatch(context.referrer, rules.referrers)) {
    reasons.push({
      code: 'referrer_mismatch',
      label: 'Referrer hedeflemesi eşleşmedi',
      detail: `${context.referrer} beklenen: ${rules.referrers.join(', ')}`
    });
  }

  if (rules.excludeReferrers?.length && context.referrer && micromatch.isMatch(context.referrer, rules.excludeReferrers)) {
    reasons.push({
      code: 'referrer_excluded',
      label: 'Referrer hariç tutuldu',
      detail: context.referrer
    });
  }

  if (rules.schedule && !isScheduleActive(rules.schedule, context.timezone)) {
    reasons.push({
      code: 'schedule_inactive',
      label: 'Zamanlama şu an aktif değil',
      detail: rules.schedule.timezone || context.timezone || 'UTC'
    });
  }

  if (rules.frequency && !checkFrequencyCap(rules.frequency, context.seenCaps)) {
    reasons.push({
      code: 'frequency_capped',
      label: 'Frequency cap dolmuş',
      detail: rules.frequency.capKey || 'default cap'
    });
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    rules
  };
}

async function explainDecision({ tenantId, placement, placementSlug, context = {} }) {
  const source = placement || await PlacementDefinition.findOne({
    tenantId,
    slug: placementSlug
  }).lean();

  if (!source) {
    return null;
  }

  const defaultRules = source.defaultRules || {};
  const evaluated = (source.experiences || []).map((experience, index) => {
    const result = explainExperienceEligibility(experience, context, defaultRules);
    return {
      id: experience._id?.toString?.() || experience.id || `draft-${index}`,
      name: experience.name || `Experience ${index + 1}`,
      status: experience.status || 'draft',
      priority: experience.priority || 50,
      weight: experience.weight || 100,
      contentType: experience.contentType,
      eligible: result.eligible,
      reasons: result.reasons,
      rules: result.rules
    };
  });

  const eligible = evaluated
    .filter((item) => item.eligible)
    .sort((a, b) => (b.priority || 50) - (a.priority || 50));
  const selected = eligible[0] || null;

  return {
    placement: {
      id: source._id?.toString?.() || source.id || null,
      slug: source.slug,
      name: source.name,
      status: source.status,
      category: source.category
    },
    context,
    selected,
    eligible,
    rejected: evaluated.filter((item) => !item.eligible),
    evaluated,
    summary: {
      total: evaluated.length,
      eligible: eligible.length,
      rejected: evaluated.length - eligible.length,
      selectionMode: 'priority-preview',
      liveSelectionNote: 'Canlı decision engine uygun experience listesinden priority sonrası weight ile seçim yapar.'
    }
  };
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
function sanitizePublicForm(form) {
  if (!form) return null;

  const formObj = form.toObject ? form.toObject() : { ...form };
  const id = formObj._id?.toString?.() || formObj.id?.toString?.() || null;

  return {
    id,
    title: formObj.title,
    description: formObj.description,
    slug: formObj.slug,
    fields: Array.isArray(formObj.fields)
      ? formObj.fields
          .filter((field) => !field.hidden)
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((field) => ({
            id: field.id,
            type: field.type,
            name: field.name,
            label: field.label,
            placeholder: field.placeholder,
            helpText: field.helpText,
            required: Boolean(field.required),
            validation: field.validation,
            options: field.options || [],
            conditionalLogic: field.conditionalLogic,
            defaultValue: field.defaultValue,
            order: field.order || 0,
            width: field.width,
            className: field.className,
            readOnly: Boolean(field.readOnly),
            disabled: Boolean(field.disabled),
          }))
      : [],
    settings: {
      submitButtonText: formObj.settings?.submitButtonText,
      successMessage: formObj.settings?.successMessage,
      redirectUrl: formObj.settings?.redirectUrl,
      enableCaptcha: Boolean(formObj.settings?.enableCaptcha),
      enableHoneypot: formObj.settings?.enableHoneypot !== false,
      allowMultipleSubmissions: formObj.settings?.allowMultipleSubmissions !== false,
      submissionCooldownSeconds: formObj.settings?.submissionCooldownSeconds ?? 60,
      requireAuth: Boolean(formObj.settings?.requireAuth),
    },
    submitEndpoint: id ? `/api/public/forms/${id}/submit` : null,
  };
}

async function resolveExperienceContent(tenantId, experience) {
  const contentType = experience.contentType;
  const payload = experience.payload || {};

  if (contentType === 'form') {
    const formId = payload.formId;
    const form = formId
      ? await FormDefinition.findOne({ _id: formId, tenantId, status: 'published' }).lean()
      : null;
    const publicForm = sanitizePublicForm(form);

    return {
      payload: {
        ...payload,
        form: publicForm,
        formId: publicForm?.id || (formId?.toString?.() || formId || null),
        submitEndpoint: publicForm?.submitEndpoint || null,
      },
      content: {
        type: 'form',
        formId: publicForm?.id || (formId?.toString?.() || formId || null),
        title: payload.title || publicForm?.title,
        submitText: payload.submitText || publicForm?.settings?.submitButtonText,
        fields: publicForm?.fields || [],
        settings: publicForm?.settings || {},
        form: publicForm,
        submitEndpoint: publicForm?.submitEndpoint || null,
      },
    };
  }

  if (contentType === 'html') {
    return {
      payload,
      content: {
        type: 'html',
        html: payload.html || '',
        data: payload.data || {},
      },
    };
  }

  if (contentType === 'text') {
    return {
      payload,
      content: {
        type: 'text',
        title: payload.title,
        message: payload.message,
        cta: payload.cta,
      },
    };
  }

  if (contentType === 'image') {
    return {
      payload,
      content: {
        type: 'image',
        imageUrl: payload.imageUrl,
        alt: payload.alt,
        cta: payload.cta,
      },
    };
  }

  if (contentType === 'video') {
    return {
      payload,
      content: {
        type: 'video',
        videoUrl: payload.videoUrl,
        autoplay: Boolean(payload.autoplay),
        controls: payload.controls !== false,
      },
    };
  }

  if (contentType === 'component') {
    return {
      payload,
      content: {
        type: 'component',
        componentId: payload.componentId,
        data: payload.data || {},
      },
    };
  }

  if (contentType === 'external') {
    return {
      payload,
      content: {
        type: 'external',
        externalUrl: payload.externalUrl,
        data: payload.data || {},
      },
    };
  }

  return {
    payload,
    content: {
      type: contentType,
      ...payload,
    },
  };
}

function resolveTrigger(placement, experience) {
  return experience.trigger || experience.rules?.trigger || placement.defaultRules?.trigger || { type: 'onLoad' };
}

function resolveFrequency(experience, placement) {
  const frequency = experience.rules?.frequency || placement.defaultRules?.frequency || null;
  if (!frequency) return null;
  return {
    capKey: frequency.capKey,
    session: frequency.maxPerSession,
    daily: frequency.maxPerDay,
    weekly: frequency.maxPerWeek,
    monthly: frequency.maxPerMonth,
    total: frequency.maxTotal,
    resetOnConversion: Boolean(frequency.resetOnConversion),
  };
}

async function buildDecision(placement, experience, context) {
  const trackingId = uuidv4();
  const { payload, content } = await resolveExperienceContent(placement.tenantId, experience);
  const trigger = resolveTrigger(placement, experience);
  const frequencyCap = resolveFrequency(experience, placement);
  const placementId = placement._id.toString();
  const experienceId = experience._id.toString();

  return {
    decisionId: trackingId,
    placementId,
    experienceId,
    contentType: experience.contentType,
    payload,
    content,
    ui: experience.ui || {},
    trigger,
    placement: {
      _id: placementId,
      id: placementId,
      slug: placement.slug,
      name: placement.name,
      category: placement.category
    },
    experience: {
      _id: experienceId,
      id: experienceId,
      name: experience.name,
      contentType: experience.contentType,
      payload,
      content,
      ui: experience.ui || {},
      trigger,
      frequencyCap,
      conversions: experience.conversions || {}
    },
    tracking: {
      placementId,
      experienceId,
      sessionId: context.sessionId,
      trackingId,
      variantWeight: experience.weight || 100,
      variantPriority: experience.priority || 50,
      capKey: experience.rules?.frequency?.capKey || placement.defaultRules?.frequency?.capKey
    },
    trackingContext: {
      ...context,
      trackingId
    },
    meta: {
      placementSlug: placement.slug,
      placementName: placement.name,
      experienceName: experience.name,
      category: placement.category
    }
  };
}

async function getPublicPlacementDetails({ tenantId, placementSlug }) {
  const placement = await PlacementDefinition.findOne({
    tenantId,
    slug: placementSlug,
    status: 'active'
  }).lean();

  if (!placement) {
    return null;
  }

  const experiences = await Promise.all(
    (placement.experiences || [])
      .filter((experience) => experience.status === 'active')
      .sort((a, b) => (b.priority || 50) - (a.priority || 50))
      .map(async (experience) => {
        const { payload, content } = await resolveExperienceContent(placement.tenantId, experience);
        return {
          id: experience._id.toString(),
          name: experience.name,
          description: experience.description,
          status: experience.status,
          priority: experience.priority,
          weight: experience.weight,
          contentType: experience.contentType,
          payload,
          content,
          ui: experience.ui || {},
          trigger: resolveTrigger(placement, experience),
          rules: experience.rules || {},
          conversions: experience.conversions || {},
          tags: experience.tags || []
        };
      })
  );

  return {
    id: placement._id.toString(),
    slug: placement.slug,
    name: placement.name,
    description: placement.description,
    category: placement.category,
    status: placement.status,
    defaultRules: placement.defaultRules || {},
    settings: placement.settings || {},
    tags: placement.tags || [],
    experiences
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
  getPublicPlacementDetails,
  explainDecision,
  filterEligibleExperiences,
  matchPaths,
  isScheduleActive,
  checkFrequencyCap,
  weightedRandomSelection
};
