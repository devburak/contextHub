/**
 * Frequency Manager
 * Handles frequency capping using localStorage
 */

const STORAGE_KEY = 'contexthub_placement_caps';
const CAP_DURATION = {
  session: 0, // Session storage
  daily: 24 * 60 * 60 * 1000, // 24 hours
  total: Infinity // Forever
};
const HAS_LOCAL_STORAGE = typeof localStorage !== 'undefined';

class FrequencyManager {
  constructor() {
    this.sessionCaps = new Map(); // In-memory for session caps
    this.loadFromStorage();
  }

  /**
   * Load caps from localStorage
   */
  loadFromStorage() {
    if (!HAS_LOCAL_STORAGE) {
      this.caps = {};
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.caps = data;
        
        // Clean expired caps
        this.cleanExpired();
      } else {
        this.caps = {};
      }
    } catch (error) {
      console.error('Failed to load frequency caps:', error);
      this.caps = {};
    }
  }

  /**
   * Save caps to localStorage
   */
  saveToStorage() {
    if (!HAS_LOCAL_STORAGE) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.caps));
    } catch (error) {
      console.error('Failed to save frequency caps:', error);
    }
  }

  /**
   * Clean expired caps
   */
  cleanExpired() {
    const now = Date.now();
    let changed = false;

    Object.keys(this.caps).forEach(key => {
      const cap = this.caps[key];
      if (cap.expiresAt && cap.expiresAt < now) {
        delete this.caps[key];
        changed = true;
      }
    });

    if (changed) {
      this.saveToStorage();
    }
  }

  /**
   * Get cap key
   */
  getCapKey(placementId, experienceId, capKey = null) {
    if (capKey) {
      return `${placementId}_${capKey}`;
    }
    return `${placementId}_${experienceId}`;
  }

  /**
   * Check if placement is capped
   */
  isCapped({ placementId, experienceId, capKey, sessionLimit, dailyLimit, totalLimit }) {
    const key = this.getCapKey(placementId, experienceId, capKey);

    // Check session cap
    if (sessionLimit && this.sessionCaps.has(key)) {
      const count = this.sessionCaps.get(key);
      if (count >= sessionLimit) {
        return true;
      }
    }

    // Check daily cap
    if (dailyLimit) {
      const dailyKey = `${key}_daily`;
      const cap = this.caps[dailyKey];
      if (cap && cap.count >= dailyLimit) {
        const now = Date.now();
        if (!cap.expiresAt || cap.expiresAt > now) {
          return true;
        }
      }
    }

    // Check total cap
    if (totalLimit) {
      const totalKey = `${key}_total`;
      const cap = this.caps[totalKey];
      if (cap && cap.count >= totalLimit) {
        return true;
      }
    }

    return false;
  }

  /**
   * Increment cap counter
   */
  increment({ placementId, experienceId, capKey, sessionLimit, dailyLimit, totalLimit }) {
    const key = this.getCapKey(placementId, experienceId, capKey);
    const now = Date.now();

    // Increment session cap
    if (sessionLimit) {
      const current = this.sessionCaps.get(key) || 0;
      this.sessionCaps.set(key, current + 1);
    }

    // Increment daily cap
    if (dailyLimit) {
      const dailyKey = `${key}_daily`;
      const cap = this.caps[dailyKey] || { count: 0 };
      
      // Reset if expired
      if (cap.expiresAt && cap.expiresAt < now) {
        cap.count = 0;
      }
      
      cap.count++;
      cap.expiresAt = now + CAP_DURATION.daily;
      this.caps[dailyKey] = cap;
    }

    // Increment total cap
    if (totalLimit) {
      const totalKey = `${key}_total`;
      const cap = this.caps[totalKey] || { count: 0 };
      cap.count++;
      this.caps[totalKey] = cap;
    }

    this.saveToStorage();
  }

  /**
   * Reset caps for a placement
   */
  reset({ placementId, experienceId, capKey }) {
    const key = this.getCapKey(placementId, experienceId, capKey);
    
    // Reset session
    this.sessionCaps.delete(key);
    
    // Reset daily
    const dailyKey = `${key}_daily`;
    delete this.caps[dailyKey];
    
    // Reset total
    const totalKey = `${key}_total`;
    delete this.caps[totalKey];
    
    this.saveToStorage();
  }

  /**
   * Clear all caps
   */
  clearAll() {
    this.sessionCaps.clear();
    this.caps = {};
    this.saveToStorage();
  }
}

// Singleton instance
const frequencyManager = new FrequencyManager();

export default frequencyManager;
