import { initTracker, getTracker, PlacementTracker } from './tracking';
import frequencyManager from './FrequencyManager';
import { usePlacement } from './hooks/usePlacement';
import { PlacementHost } from './components/PlacementHost';

export { initTracker, getTracker, PlacementTracker };
export { frequencyManager };
export { usePlacement };
export { PlacementHost };

// Vanilla JS API
export class ContextHubPlacement {
  constructor(options = {}) {
    this.options = options;
    this.tracker = null;
  }

  /**
   * Initialize SDK
   */
  async init({ apiUrl, tenantId, userKey }) {
    const { initTracker } = await import('./tracking');
    this.tracker = initTracker({ apiUrl, tenantId, userKey });
    return this;
  }

  /**
   * Fetch and render placement
   */
  async render(placementSlug, containerId, context = {}) {
    if (!this.tracker) {
      throw new Error('SDK not initialized. Call init() first.');
    }

    try {
      // Fetch decision
      const response = await fetch(`${this.tracker.apiUrl}/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          placement: placementSlug,
          context: {
            ...context,
            path: window.location.pathname,
            referrer: document.referrer,
            ...this.tracker.getDeviceInfo()
          }
        })
      });

      if (!response.ok) {
        console.error('Failed to fetch placement');
        return null;
      }

      const decision = await response.json();

      // Track impression
      this.tracker.trackImpression({
        placementId: decision.placement._id,
        experienceId: decision.experience._id,
        decisionId: decision.decisionId,
        context: decision.trackingContext
      });

      // Render to DOM
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`Container ${containerId} not found`);
        return null;
      }

      container.innerHTML = this.buildHTML(decision);
      this.attachEventListeners(container, decision);

      return decision;
    } catch (error) {
      console.error('Failed to render placement:', error);
      return null;
    }
  }

  /**
   * Build HTML from decision
   */
  buildHTML(decision) {
    const { content, ui } = decision.experience;

    switch (content.type) {
      case 'html':
        return content.html;
        
      case 'text':
        return `
          <div class="contexthub-placement">
            ${content.title ? `<h2>${content.title}</h2>` : ''}
            ${content.message ? `<p>${content.message}</p>` : ''}
            ${content.cta ? `
              <a href="${content.cta.url}" target="${content.cta.newTab ? '_blank' : '_self'}">
                ${content.cta.text}
              </a>
            ` : ''}
          </div>
        `;
        
      case 'image':
        return `
          <div class="contexthub-placement">
            <img src="${content.imageUrl}" alt="${content.alt || ''}" />
            ${content.cta ? `
              <a href="${content.cta.url}" target="${content.cta.newTab ? '_blank' : '_self'}">
                ${content.cta.text}
              </a>
            ` : ''}
          </div>
        `;
        
      default:
        return `<div>Unknown content type: ${content.type}</div>`;
    }
  }

  /**
   * Attach event listeners for tracking
   */
  attachEventListeners(container, decision) {
    // Track clicks
    container.addEventListener('click', (e) => {
      this.tracker.trackClick({
        placementId: decision.placement._id,
        experienceId: decision.experience._id,
        decisionId: decision.decisionId,
        target: e.target.innerText || e.target.getAttribute('href'),
        context: decision.trackingContext
      });
    });

    // Track view when visible
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.tracker.trackView({
              placementId: decision.placement._id,
              experienceId: decision.experience._id,
              decisionId: decision.decisionId,
              context: decision.trackingContext
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(container);
  }

  /**
   * Track custom conversion
   */
  trackConversion(placementId, experienceId, decisionId, goalId, value, metadata) {
    if (!this.tracker) {
      console.error('SDK not initialized');
      return;
    }

    this.tracker.trackConversion({
      placementId,
      experienceId,
      decisionId,
      goalId,
      value,
      metadata
    });
  }
}

// Default export for convenience
export default {
  initTracker,
  getTracker,
  PlacementTracker,
  usePlacement,
  PlacementHost,
  frequencyManager,
  ContextHubPlacement
};
