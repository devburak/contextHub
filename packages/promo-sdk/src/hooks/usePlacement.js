import { useState, useEffect, useRef, useCallback } from 'react';
import frequencyManager from '../FrequencyManager';
import { getTracker } from '../tracking';

/**
 * React Hook for Placement System
 * Fetches decision, tracks events, handles frequency capping
 */
export function usePlacement({
  placementSlug,
  context = {},
  autoTrack = true,
  enabled = true,
  onDecision,
  onError
}) {
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  
  const tracker = getTracker();
  const viewTrackedRef = useRef(false);
  const shownAtRef = useRef(null);

  /**
   * Fetch decision from API
   */
  const fetchDecision = useCallback(async () => {
    if (!enabled) return null;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${tracker.apiUrl}/decide`, {
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
            ...tracker.getDeviceInfo()
          }
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No eligible experience
          return null;
        }
        throw new Error(`Failed to fetch decision: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check client-side frequency cap
      if (data.experience.frequencyCap) {
        const isCapped = frequencyManager.isCapped({
          placementId: data.placement._id,
          experienceId: data.experience._id,
          capKey: data.experience.frequencyCap.capKey,
          sessionLimit: data.experience.frequencyCap.session,
          dailyLimit: data.experience.frequencyCap.daily,
          totalLimit: data.experience.frequencyCap.total
        });

        if (isCapped) {
          console.log('Placement capped by frequency rules');
          return null;
        }
      }

      setDecision(data);
      
      // Track impression
      if (autoTrack) {
        tracker.trackImpression({
          placementId: data.placement._id,
          experienceId: data.experience._id,
          decisionId: data.decisionId,
          context: data.trackingContext
        });
        
        // Increment frequency cap
        if (data.experience.frequencyCap) {
          frequencyManager.increment({
            placementId: data.placement._id,
            experienceId: data.experience._id,
            capKey: data.experience.frequencyCap.capKey,
            sessionLimit: data.experience.frequencyCap.session,
            dailyLimit: data.experience.frequencyCap.daily,
            totalLimit: data.experience.frequencyCap.total
          });
        }
      }

      if (onDecision) {
        onDecision(data);
      }

      return data;
    } catch (err) {
      console.error('Failed to fetch placement decision:', err);
      setError(err);
      
      if (onError) {
        onError(err);
      }
      
      if (autoTrack && decision) {
        tracker.trackError({
          placementId: decision.placement._id,
          experienceId: decision.experience._id,
          decisionId: decision.decisionId,
          error: err
        });
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, [placementSlug, context, enabled, autoTrack, tracker, onDecision, onError]);

  /**
   * Show placement
   */
  const show = useCallback(() => {
    setVisible(true);
    shownAtRef.current = Date.now();
    viewTrackedRef.current = false;
  }, []);

  /**
   * Hide placement
   */
  const hide = useCallback(() => {
    setVisible(false);
    
    // Track close with duration
    if (autoTrack && decision && shownAtRef.current) {
      const duration = Date.now() - shownAtRef.current;
      tracker.trackClose({
        placementId: decision.placement._id,
        experienceId: decision.experience._id,
        decisionId: decision.decisionId,
        duration,
        context: decision.trackingContext
      });
      shownAtRef.current = null;
    }
  }, [decision, autoTrack, tracker]);

  /**
   * Track view (when placement becomes visible in viewport)
   */
  const trackView = useCallback(() => {
    if (!autoTrack || !decision || viewTrackedRef.current) return;
    
    tracker.trackView({
      placementId: decision.placement._id,
      experienceId: decision.experience._id,
      decisionId: decision.decisionId,
      context: decision.trackingContext
    });
    
    viewTrackedRef.current = true;
  }, [decision, autoTrack, tracker]);

  /**
   * Track click
   */
  const trackClick = useCallback((target) => {
    if (!autoTrack || !decision) return;
    
    tracker.trackClick({
      placementId: decision.placement._id,
      experienceId: decision.experience._id,
      decisionId: decision.decisionId,
      target,
      context: decision.trackingContext
    });
  }, [decision, autoTrack, tracker]);

  /**
   * Track conversion
   */
  const trackConversion = useCallback((goalId, value, metadata) => {
    if (!decision) return;
    
    tracker.trackConversion({
      placementId: decision.placement._id,
      experienceId: decision.experience._id,
      decisionId: decision.decisionId,
      goalId,
      value,
      metadata,
      context: decision.trackingContext
    });
  }, [decision, tracker]);

  /**
   * Dismiss placement
   */
  const dismiss = useCallback((reason) => {
    if (autoTrack && decision) {
      tracker.trackDismissal({
        placementId: decision.placement._id,
        experienceId: decision.experience._id,
        decisionId: decision.decisionId,
        reason,
        context: decision.trackingContext
      });
    }
    
    hide();
  }, [decision, autoTrack, tracker, hide]);

  /**
   * Fetch decision on mount
   */
  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  /**
   * Track view when visible
   */
  useEffect(() => {
    if (visible) {
      trackView();
    }
  }, [visible, trackView]);

  return {
    decision,
    loading,
    error,
    visible,
    show,
    hide,
    trackClick,
    trackConversion,
    trackView,
    dismiss,
    refetch: fetchDecision
  };
}
