class UpstashClientStub {
  initialize() {
    console.warn('[Upstash] Deprecated runtime client is disabled. Local Redis usage tracking is active instead.');
  }

  isEnabled() {
    return false;
  }

  getClient() {
    throw new Error('Upstash runtime support has been removed');
  }

  async logRequest() {
    return null;
  }

  async getDailyCount() {
    return 0;
  }

  async getWeeklyCount() {
    return 0;
  }

  async getMonthlyCount() {
    return 0;
  }

  async getApiStats() {
    return {
      fourHour: 0,
      daily: 0,
      today: 0,
      weekly: 0,
      monthly: 0,
      enabled: false,
    };
  }

  async cleanupLegacyLogs() {
    return { deleted: 0, skipped: true };
  }
}

module.exports = new UpstashClientStub();
