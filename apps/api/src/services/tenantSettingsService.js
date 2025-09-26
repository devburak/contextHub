const { TenantSettings } = require('@contexthub/common');

const DEFAULT_SETTINGS = Object.freeze({
  smtp: {
    enabled: false,
    host: '',
    port: null,
    secure: true,
    username: '',
    fromName: '',
    fromEmail: '',
    hasPassword: false
  },
  webhook: {
    enabled: false,
    url: '',
    hasSecret: false
  },
  branding: {
    siteName: '',
    logoUrl: '',
    primaryColor: '',
    secondaryColor: '',
    description: ''
  },
  limits: {
    entries: null,
    media: null,
    users: null,
    apiCalls: null,
    emailPerMonth: null,
    custom: {}
  },
  features: {},
  metadata: {}
});

class TenantSettingsService {
  async getSettings(tenantId) {
    const doc = await TenantSettings.findOne({ tenantId })
      .select('+smtp.password +webhook.secret')
      .lean();

    return this.#serialize(tenantId, doc);
  }

  async upsertSettings(tenantId, payload = {}) {
    const doc = await TenantSettings.findOne({ tenantId })
      .select('+smtp.password +webhook.secret');

    const target = doc || new TenantSettings({ tenantId });

    if (payload.smtp) {
      target.smtp = target.smtp || {};
      if (typeof payload.smtp.enabled === 'boolean') {
        target.smtp.enabled = payload.smtp.enabled;
      }
      if (payload.smtp.host !== undefined) {
        target.smtp.host = this.#emptyToUndefined(payload.smtp.host);
      }
      if (payload.smtp.port !== undefined) {
        target.smtp.port = this.#toNullableNumber(payload.smtp.port);
      }
      if (payload.smtp.secure !== undefined) {
        target.smtp.secure = Boolean(payload.smtp.secure);
      }
      if (payload.smtp.username !== undefined) {
        target.smtp.username = this.#emptyToUndefined(payload.smtp.username);
      }
      if (payload.smtp.fromName !== undefined) {
        target.smtp.fromName = this.#emptyToUndefined(payload.smtp.fromName);
      }
      if (payload.smtp.fromEmail !== undefined) {
        target.smtp.fromEmail = this.#emptyToUndefined(payload.smtp.fromEmail);
      }
      if (payload.smtp.password !== undefined) {
        const value = this.#emptyToUndefined(payload.smtp.password);
        if (value === undefined) {
          target.smtp.password = undefined;
        } else {
          target.smtp.password = value;
        }
      }
    }

    if (payload.webhook) {
      target.webhook = target.webhook || {};
      if (typeof payload.webhook.enabled === 'boolean') {
        target.webhook.enabled = payload.webhook.enabled;
      }
      if (payload.webhook.url !== undefined) {
        target.webhook.url = this.#emptyToUndefined(payload.webhook.url);
      }
      if (payload.webhook.secret !== undefined) {
        const secret = this.#emptyToUndefined(payload.webhook.secret);
        if (secret === undefined) {
          target.webhook.secret = undefined;
        } else {
          target.webhook.secret = secret;
        }
      }
    }

    if (payload.branding) {
      target.branding = target.branding || {};
      if (payload.branding.siteName !== undefined) {
        target.branding.siteName = this.#emptyToUndefined(payload.branding.siteName);
      }
      if (payload.branding.logoUrl !== undefined) {
        target.branding.logoUrl = this.#emptyToUndefined(payload.branding.logoUrl);
      }
      if (payload.branding.primaryColor !== undefined) {
        target.branding.primaryColor = this.#emptyToUndefined(payload.branding.primaryColor);
      }
      if (payload.branding.secondaryColor !== undefined) {
        target.branding.secondaryColor = this.#emptyToUndefined(payload.branding.secondaryColor);
      }
      if (payload.branding.description !== undefined) {
        target.branding.description = this.#emptyToUndefined(payload.branding.description);
      }
    }

    if (payload.limits) {
      target.limits = target.limits || {};
      if (payload.limits.entries !== undefined) {
        target.limits.entries = this.#toNullableNumber(payload.limits.entries);
      }
      if (payload.limits.media !== undefined) {
        target.limits.media = this.#toNullableNumber(payload.limits.media);
      }
      if (payload.limits.users !== undefined) {
        target.limits.users = this.#toNullableNumber(payload.limits.users);
      }
      if (payload.limits.apiCalls !== undefined) {
        target.limits.apiCalls = this.#toNullableNumber(payload.limits.apiCalls);
      }
      if (payload.limits.emailPerMonth !== undefined) {
        target.limits.emailPerMonth = this.#toNullableNumber(payload.limits.emailPerMonth);
      }
      if (payload.limits.custom !== undefined && typeof payload.limits.custom === 'object' && payload.limits.custom !== null) {
        target.limits.custom = new Map(Object.entries(payload.limits.custom).map(([key, value]) => [key, this.#toNullableNumber(value)]));
      }
    }

    if (payload.features !== undefined) {
      target.features = new Map();
      if (payload.features && typeof payload.features === 'object') {
        Object.entries(payload.features).forEach(([key, value]) => {
          target.features.set(key, Boolean(value));
        });
      }
    }

    if (payload.metadata !== undefined) {
      target.metadata = new Map();
      if (payload.metadata && typeof payload.metadata === 'object') {
        Object.entries(payload.metadata).forEach(([key, value]) => {
          target.metadata.set(key, value);
        });
      }
    }

    const saved = await target.save();
    return this.#serialize(tenantId, saved.toObject({ depopulate: true }));
  }

  #serialize(tenantId, doc) {
    const base = {
      tenantId,
      ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      createdAt: doc?.createdAt || null,
      updatedAt: doc?.updatedAt || null
    };

    if (!doc) {
      return base;
    }

    const result = { ...base };

    if (doc.smtp) {
      result.smtp = {
        ...base.smtp,
        enabled: doc.smtp.enabled ?? base.smtp.enabled,
        host: doc.smtp.host ?? base.smtp.host,
        port: doc.smtp.port ?? base.smtp.port,
        secure: doc.smtp.secure ?? base.smtp.secure,
        username: doc.smtp.username ?? base.smtp.username,
        fromName: doc.smtp.fromName ?? base.smtp.fromName,
        fromEmail: doc.smtp.fromEmail ?? base.smtp.fromEmail,
        hasPassword: Boolean(doc.smtp.password)
      };
    }

    if (doc.webhook) {
      result.webhook = {
        ...base.webhook,
        enabled: doc.webhook.enabled ?? base.webhook.enabled,
        url: doc.webhook.url ?? base.webhook.url,
        hasSecret: Boolean(doc.webhook.secret)
      };
    }

    if (doc.branding) {
      result.branding = {
        ...base.branding,
        siteName: doc.branding.siteName ?? base.branding.siteName,
        logoUrl: doc.branding.logoUrl ?? base.branding.logoUrl,
        primaryColor: doc.branding.primaryColor ?? base.branding.primaryColor,
        secondaryColor: doc.branding.secondaryColor ?? base.branding.secondaryColor,
        description: doc.branding.description ?? base.branding.description
      };
    }

    if (doc.limits) {
      result.limits = {
        ...base.limits,
        entries: doc.limits.entries ?? base.limits.entries,
        media: doc.limits.media ?? base.limits.media,
        users: doc.limits.users ?? base.limits.users,
        apiCalls: doc.limits.apiCalls ?? base.limits.apiCalls,
        emailPerMonth: doc.limits.emailPerMonth ?? base.limits.emailPerMonth,
        custom: doc.limits.custom instanceof Map
          ? Object.fromEntries(Array.from(doc.limits.custom.entries()))
          : doc.limits.custom ?? base.limits.custom
      };
    }

    if (doc.features) {
      result.features = doc.features instanceof Map
        ? Object.fromEntries(Array.from(doc.features.entries()))
        : doc.features;
    }

    if (doc.metadata) {
      result.metadata = doc.metadata instanceof Map
        ? Object.fromEntries(Array.from(doc.metadata.entries()))
        : doc.metadata;
    }

    return result;
  }

  #emptyToUndefined(value) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }
    return value;
  }

  #toNullableNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
}

module.exports = new TenantSettingsService();
