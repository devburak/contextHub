import { v4 as uuidv4 } from 'uuid';

/**
 * Tracking Utilities
 * Client-side event tracking with batching and offline queue
 */

class PlacementTracker {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || '/api/public/placements';
    this.tenantId = options.tenantId;
    this.batchSize = options.batchSize || 10;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.queue = [];
    this.sessionId = this.getOrCreateSessionId();
    this.userKey = options.userKey || null;
    
    // Auto-flush
    if (typeof window !== 'undefined') {
      this.startAutoFlush();
      this.setupBeforeUnload();
    }
  }

  /**
   * Get or create session ID
   */
  getOrCreateSessionId() {
    if (typeof window === 'undefined') return null;
    
    const key = 'contexthub_session_id';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = uuidv4();
      sessionStorage.setItem(key, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Start auto-flush timer
   */
  startAutoFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Setup beforeunload handler to flush queue
   */
  setupBeforeUnload() {
    window.addEventListener('beforeunload', () => {
      this.flush(true); // Synchronous flush
    });
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    if (typeof window === 'undefined') return {};
    
    const ua = navigator.userAgent;
    let device = 'desktop';
    
    if (/mobile/i.test(ua)) device = 'mobile';
    else if (/tablet|ipad/i.test(ua)) device = 'tablet';
    
    // Simple browser detection
    let browser = 'unknown';
    if (ua.includes('Chrome')) browser = 'chrome';
    else if (ua.includes('Safari')) browser = 'safari';
    else if (ua.includes('Firefox')) browser = 'firefox';
    else if (ua.includes('Edge')) browser = 'edge';
    
    return {
      device,
      browser,
      userAgent: ua,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }

  /**
   * Track an event
   */
  track({ type, placementId, experienceId, context = {} }) {
    if (!placementId) {
      console.error('placementId is required for tracking');
      return;
    }

    const event = {
      type,
      placementId,
      experienceId,
      sessionId: this.sessionId,
      userKey: this.userKey,
      timestamp: new Date().toISOString(),
      path: typeof window !== 'undefined' ? window.location.pathname : null,
      referrer: typeof document !== 'undefined' ? document.referrer : null,
      ...this.getDeviceInfo(),
      ...context
    };

    this.queue.push(event);

    // Auto-flush if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Track impression
   */
  trackImpression({ placementId, experienceId, decisionId, context }) {
    this.track({
      type: 'impression',
      placementId,
      experienceId,
      decisionId,
      context
    });
  }

  /**
   * Track view (when placement becomes visible)
   */
  trackView({ placementId, experienceId, decisionId, context }) {
    this.track({
      type: 'view',
      placementId,
      experienceId,
      decisionId,
      context
    });
  }

  /**
   * Track click
   */
  trackClick({ placementId, experienceId, decisionId, target, context }) {
    this.track({
      type: 'click',
      placementId,
      experienceId,
      decisionId,
      target,
      context
    });
  }

  /**
   * Track conversion
   */
  trackConversion({ placementId, experienceId, decisionId, goalId, value, metadata, context }) {
    this.track({
      type: 'conversion',
      placementId,
      experienceId,
      decisionId,
      goalId,
      conversionValue: value,
      conversionMetadata: metadata,
      context
    });
  }

  /**
   * Track close
   */
  trackClose({ placementId, experienceId, decisionId, duration, context }) {
    this.track({
      type: 'close',
      placementId,
      experienceId,
      decisionId,
      duration,
      context
    });
  }

  /**
   * Track dismissal
   */
  trackDismissal({ placementId, experienceId, decisionId, reason, context }) {
    this.track({
      type: 'dismissal',
      placementId,
      experienceId,
      decisionId,
      dismissalReason: reason,
      context
    });
  }

  /**
   * Track form submit
   */
  trackSubmit({ placementId, experienceId, decisionId, formData, context }) {
    this.track({
      type: 'submit',
      placementId,
      experienceId,
      decisionId,
      formData,
      context
    });
  }

  /**
   * Track error
   */
  trackError({ placementId, experienceId, decisionId, error, context }) {
    this.track({
      type: 'error',
      placementId,
      experienceId,
      decisionId,
      errorMessage: error?.message || error,
      errorStack: error?.stack,
      context
    });
  }

  /**
   * Flush queue to server
   */
  async flush(sync = false) {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    const url = `${this.apiUrl}/events/batch`;
    const payload = { events };

    try {
      if (sync && navigator.sendBeacon) {
        // Use sendBeacon for synchronous flush (beforeunload)
        navigator.sendBeacon(url, JSON.stringify(payload));
      } else {
        // Regular async fetch
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (error) {
      console.error('Failed to flush events:', error);
      // Re-add to queue on failure
      this.queue.unshift(...events);
    }
  }

  /**
   * Destroy tracker
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(true);
  }
}

// Export singleton
let defaultTracker = null;

export function initTracker(options) {
  defaultTracker = new PlacementTracker(options);
  return defaultTracker;
}

export function getTracker() {
  if (!defaultTracker) {
    console.warn('Tracker not initialized. Call initTracker() first.');
    defaultTracker = new PlacementTracker();
  }
  return defaultTracker;
}

export { PlacementTracker };
