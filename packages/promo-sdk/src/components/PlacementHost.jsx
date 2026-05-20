import React, { useEffect, useRef } from 'react';
import { usePlacement } from '../hooks/usePlacement';
import { getTracker } from '../tracking';

/**
 * PlacementHost Component
 * Renders placement content based on UI variant
 */
export function PlacementHost({
  placementSlug,
  context = {},
  trigger = null,
  autoTrack = true,
  className = '',
  style = {},
  onDecision,
  onClose,
  onConversion,
  children
}) {
  const {
    decision,
    loading,
    visible,
    show,
    hide,
    trackClick,
    trackConversion,
    dismiss
  } = usePlacement({
    placementSlug,
    context,
    autoTrack,
    enabled: true,
    onDecision
  });

  const containerRef = useRef(null);
  const hasTriggeredRef = useRef(false);

  /**
   * Handle triggers
   */
  useEffect(() => {
    if (!decision || hasTriggeredRef.current) return;

    const handleTrigger = () => {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;
      show();
    };

    const resolvedTrigger = typeof trigger === 'string'
      ? { type: trigger }
      : trigger || decision.experience?.trigger || decision.trigger || { type: 'onLoad' };

    switch (resolvedTrigger.type) {
      case 'onLoad':
        handleTrigger();
        break;
        
      case 'onScroll':
        const handleScroll = () => {
          const scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
          if (scrollPercent > 50) { // Trigger at 50% scroll
            handleTrigger();
            window.removeEventListener('scroll', handleScroll);
          }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
        
      case 'onExit':
        const handleMouseLeave = (e) => {
          if (e.clientY < 0) { // Mouse leaving from top
            handleTrigger();
            document.removeEventListener('mouseleave', handleMouseLeave);
          }
        };
        document.addEventListener('mouseleave', handleMouseLeave);
        return () => document.removeEventListener('mouseleave', handleMouseLeave);
        
      case 'afterDelay':
      case 'onTimeout':
        const timer = setTimeout(() => {
          handleTrigger();
        }, resolvedTrigger.delay || 3000);
        return () => clearTimeout(timer);
        
      case 'manual':
        // Manual trigger, no auto-show
        break;
        
      default:
        handleTrigger();
    }
  }, [decision, trigger, show]);

  /**
   * Intersection Observer for view tracking
   */
  useEffect(() => {
    if (!containerRef.current || !visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Element is 50%+ visible, track view
            // This is handled by usePlacement hook
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  /**
   * Handle close
   */
  const handleClose = () => {
    hide();
    if (onClose) {
      onClose();
    }
  };

  /**
   * Handle dismiss
   */
  const handleDismiss = (reason) => {
    dismiss(reason);
    if (onClose) {
      onClose();
    }
  };

  /**
   * Handle click with tracking
   */
  const handleClick = (e) => {
    const target = e.target.getAttribute('data-target') || e.target.innerText;
    trackClick(target);
  };

  /**
   * Handle conversion
   */
  const handleConversion = (goalId, value, metadata) => {
    trackConversion(goalId, value, metadata);
    if (onConversion) {
      onConversion(goalId, value, metadata);
    }
  };

  if (loading) {
    return <div className="contexthub-placement-loading">Loading...</div>;
  }

  if (!decision || !visible) {
    return null;
  }

  const { experience } = decision;
  const { content, ui } = experience;

  // Render custom children with render props
  if (children) {
    return children({
      decision,
      content,
      ui,
      handleClose,
      handleDismiss,
      handleClick,
      handleConversion,
      containerRef
    });
  }

  // Default rendering based on UI variant
  return (
    <div
      ref={containerRef}
      className={`contexthub-placement contexthub-${ui.variant} ${className}`}
      style={{
        ...getVariantStyles(ui),
        ...style
      }}
      onClick={handleClick}
    >
      {renderContent(content, ui, handleClose, handleDismiss, handleConversion)}
    </div>
  );
}

/**
 * Get styles based on UI variant
 */
function getVariantStyles(ui) {
  const baseStyles = {
    position: ui.position || 'fixed',
    zIndex: ui.zIndex || 9999
  };

  switch (ui.variant) {
    case 'modal':
      return {
        ...baseStyles,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: ui.width || '500px',
        backgroundColor: ui.backgroundColor || '#fff',
        borderRadius: ui.borderRadius || '8px',
        padding: ui.padding || '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      };
      
    case 'banner-top':
      return {
        ...baseStyles,
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: ui.backgroundColor || '#000',
        color: ui.textColor || '#fff',
        padding: ui.padding || '16px',
        textAlign: 'center'
      };
      
    case 'banner-bottom':
      return {
        ...baseStyles,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: ui.backgroundColor || '#000',
        color: ui.textColor || '#fff',
        padding: ui.padding || '16px',
        textAlign: 'center'
      };
      
    case 'slide-in-right':
      return {
        ...baseStyles,
        top: ui.offset?.top || '100px',
        right: ui.offset?.right || '20px',
        maxWidth: ui.width || '400px',
        backgroundColor: ui.backgroundColor || '#fff',
        borderRadius: ui.borderRadius || '8px',
        padding: ui.padding || '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      };
      
    case 'slide-in-left':
      return {
        ...baseStyles,
        top: ui.offset?.top || '100px',
        left: ui.offset?.left || '20px',
        maxWidth: ui.width || '400px',
        backgroundColor: ui.backgroundColor || '#fff',
        borderRadius: ui.borderRadius || '8px',
        padding: ui.padding || '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      };
      
    case 'corner-popup':
    case 'toast':
      return {
        ...baseStyles,
        bottom: ui.offset?.bottom || '20px',
        right: ui.offset?.right || '20px',
        maxWidth: ui.width || '350px',
        backgroundColor: ui.backgroundColor || '#fff',
        borderRadius: ui.borderRadius || '12px',
        padding: ui.padding || '20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      };
      
    case 'fullscreen-takeover':
      return {
        ...baseStyles,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: ui.backgroundColor || 'rgba(0,0,0,0.9)',
        color: ui.textColor || '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: ui.padding || '40px'
      };
      
    case 'inline':
    default:
      return {
        position: 'relative',
        ...ui.styles
      };
  }
}

/**
 * Render content based on type
 */
function getLocalizedText(value, fallback = '') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.tr || value.en || Object.values(value)[0] || fallback;
}

function resolveEndpoint(endpoint, apiUrl) {
  if (!endpoint) return null;
  try {
    const base = apiUrl || (typeof window !== 'undefined' ? window.location.origin : undefined);
    return base ? new URL(endpoint, base).toString() : endpoint;
  } catch (error) {
    return endpoint;
  }
}

function renderContent(content, ui, handleClose, handleDismiss, handleConversion) {
  // Close button
  const closeButton = ui.showCloseButton !== false && (
    <button
      className="contexthub-close"
      onClick={() => handleClose()}
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: ui.textColor || '#333'
      }}
    >
      ×
    </button>
  );

  switch (content.type) {
    case 'html':
      return (
        <>
          {closeButton}
          <div dangerouslySetInnerHTML={{ __html: content.html }} />
        </>
      );
      
    case 'text':
      return (
        <>
          {closeButton}
          {content.title && <h2>{content.title}</h2>}
          {content.message && <p>{content.message}</p>}
          {content.cta && (
            <a
              href={content.cta.url}
              target={content.cta.newTab ? '_blank' : '_self'}
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: ui.buttonColor || '#007bff',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '4px'
              }}
            >
              {content.cta.text}
            </a>
          )}
        </>
      );
      
    case 'image':
      return (
        <>
          {closeButton}
          <img
            src={content.imageUrl}
            alt={content.alt || ''}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
          {content.cta && (
            <a
              href={content.cta.url}
              target={content.cta.newTab ? '_blank' : '_self'}
              rel="noopener noreferrer"
            >
              {content.cta.text}
            </a>
          )}
        </>
      );
      
    case 'video':
      return (
        <>
          {closeButton}
          <video
            src={content.videoUrl}
            controls={content.controls !== false}
            autoPlay={content.autoplay}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </>
      );
      
    case 'form':
      return (
        <>
          {closeButton}
          {content.title && <h2>{getLocalizedText(content.title)}</h2>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const data = Object.fromEntries(formData);
              const tracker = getTracker();

              if (!content.submitEndpoint) {
                console.log('Form submitted:', data);
                handleConversion?.('formSubmit', 1, { formId: content.formId, data });
                return;
              }

              const response = await fetch(resolveEndpoint(content.submitEndpoint, tracker.apiUrl), {
                method: 'POST',
                headers: tracker.getHeaders(),
                body: JSON.stringify({ data })
              });

              if (!response.ok) {
                throw new Error(`Form submit failed: ${response.status}`);
              }

              handleConversion?.('formSubmit', 1, { formId: content.formId });
            }}
          >
            {content.fields?.map((field, idx) => (
              <div key={idx} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px' }}>
                  {getLocalizedText(field.label, field.name)}
                </label>
                <input
                  type={field.type || 'text'}
                  name={field.name}
                  required={field.required}
                  placeholder={getLocalizedText(field.placeholder)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ccc',
                    borderRadius: '4px'
                  }}
                />
              </div>
            ))}
            <button
              type="submit"
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                backgroundColor: ui.buttonColor || '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {getLocalizedText(content.submitText, getLocalizedText(content.settings?.submitButtonText, 'Submit'))}
            </button>
          </form>
        </>
      );

    case 'external':
      return (
        <>
          {closeButton}
          <iframe
            src={content.externalUrl}
            title="ContextHub placement"
            style={{ width: '100%', minHeight: ui.height || '320px', border: 0 }}
          />
        </>
      );
      
    case 'component':
      // Custom component rendering (requires external component)
      return (
        <>
          {closeButton}
          <div>Custom component: {content.componentId}</div>
        </>
      );
      
    default:
      return <div>Unknown content type: {content.type}</div>;
  }
}

export default PlacementHost;
