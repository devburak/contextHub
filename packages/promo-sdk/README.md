# @contexthub/promo-sdk

Frontend SDK for ContextHub Placement System. Easily integrate popups, banners, and inline content with targeting, A/B testing, and analytics.

## Installation

```bash
npm install @contexthub/promo-sdk
# or
pnpm add @contexthub/promo-sdk
```

## Quick Start

### React

```jsx
import { initTracker, PlacementHost } from '@contexthub/promo-sdk';

// Initialize tracker once in your app
initTracker({
  apiUrl: 'https://api.contexthub.com/api/public/placements',
  tenantId: 'your-tenant-id',
  userKey: 'user-123' // optional
});

// Use PlacementHost component
function App() {
  return (
    <PlacementHost
      placementSlug="welcome-popup"
      trigger="onLoad"
      onDecision={(decision) => console.log('Placement shown:', decision)}
      onConversion={(goalId, value) => console.log('Conversion:', goalId, value)}
    />
  );
}
```

### React Hook

```jsx
import { usePlacement } from '@contexthub/promo-sdk';

function MyComponent() {
  const {
    decision,
    loading,
    visible,
    show,
    hide,
    trackClick,
    trackConversion
  } = usePlacement({
    placementSlug: 'promo-banner',
    autoTrack: true
  });

  if (loading) return <div>Loading...</div>;
  if (!decision || !visible) return null;

  const { experience } = decision;

  return (
    <div>
      <h2>{experience.content.title}</h2>
      <p>{experience.content.message}</p>
      <button onClick={() => {
        trackClick('cta-button');
        trackConversion('signup', 0);
      }}>
        {experience.content.cta.text}
      </button>
      <button onClick={() => hide()}>Close</button>
    </div>
  );
}
```

### Vanilla JavaScript

```html
<script src="https://cdn.contexthub.com/promo-sdk/v1/index.js"></script>
<script>
  const sdk = new ContextHubPlacement();
  
  sdk.init({
    apiUrl: 'https://api.contexthub.com/api/public/placements',
    tenantId: 'your-tenant-id'
  }).then(() => {
    sdk.render('welcome-popup', 'placement-container');
  });
</script>

<div id="placement-container"></div>
```

## API Reference

### `initTracker(options)`

Initialize the tracking system.

```js
initTracker({
  apiUrl: string,        // API base URL
  tenantId: string,      // Your tenant ID
  userKey?: string,      // Optional user identifier
  batchSize?: number,    // Event batch size (default: 10)
  flushInterval?: number // Flush interval in ms (default: 5000)
});
```

### `<PlacementHost>`

React component for rendering placements.

```jsx
<PlacementHost
  placementSlug="string"           // Placement slug (required)
  context={{}}                     // Additional context
  trigger="onLoad|onScroll|onExit|onTimeout|manual"
  autoTrack={true}                 // Auto-track events
  className="string"               // CSS class
  style={{}}                       // Inline styles
  onDecision={(decision) => {}}    // Callback when decision fetched
  onClose={() => {}}               // Callback when closed
  onConversion={(goalId, value, metadata) => {}}
>
  {/* Optional: Custom render */}
  {({ decision, content, ui, handleClose, handleClick }) => (
    <div>
      {/* Your custom UI */}
    </div>
  )}
</PlacementHost>
```

### `usePlacement(options)`

React hook for placement logic.

```js
const {
  decision,        // Decision object
  loading,         // Loading state
  error,           // Error state
  visible,         // Visibility state
  show,            // Show placement
  hide,            // Hide placement
  trackClick,      // Track click event
  trackConversion, // Track conversion
  trackView,       // Track view event
  dismiss,         // Dismiss with reason
  refetch          // Refetch decision
} = usePlacement({
  placementSlug: string,
  context?: object,
  autoTrack?: boolean,
  enabled?: boolean,
  onDecision?: (decision) => void,
  onError?: (error) => void
});
```

### Triggers

- `onLoad`: Show immediately when loaded
- `onScroll`: Show after 50% page scroll
- `onExit`: Show when mouse leaves viewport
- `onTimeout`: Show after delay (default: 3s)
- `manual`: Manual control with `show()` method

### Tracking Methods

```js
import { getTracker } from '@contexthub/promo-sdk';

const tracker = getTracker();

// Track events manually
tracker.trackImpression({ placementId, experienceId, decisionId, context });
tracker.trackView({ placementId, experienceId, decisionId, context });
tracker.trackClick({ placementId, experienceId, decisionId, target, context });
tracker.trackConversion({ placementId, experienceId, decisionId, goalId, value, metadata, context });
tracker.trackClose({ placementId, experienceId, decisionId, duration, context });
tracker.trackDismissal({ placementId, experienceId, decisionId, reason, context });
tracker.trackSubmit({ placementId, experienceId, decisionId, formData, context });
tracker.trackError({ placementId, experienceId, decisionId, error, context });

// Manual flush
tracker.flush();
```

### Frequency Manager

```js
import { frequencyManager } from '@contexthub/promo-sdk';

// Check if capped
const isCapped = frequencyManager.isCapped({
  placementId,
  experienceId,
  capKey,
  sessionLimit: 3,
  dailyLimit: 5,
  totalLimit: 10
});

// Reset caps
frequencyManager.reset({ placementId, experienceId, capKey });

// Clear all caps
frequencyManager.clearAll();
```

## Content Types

### HTML

```json
{
  "type": "html",
  "html": "<div class='custom'>...</div>"
}
```

### Text

```json
{
  "type": "text",
  "title": "Welcome!",
  "message": "Get 20% off your first order",
  "cta": {
    "text": "Shop Now",
    "url": "/shop",
    "newTab": false
  }
}
```

### Image

```json
{
  "type": "image",
  "imageUrl": "https://...",
  "alt": "Promo image",
  "cta": {
    "text": "Learn More",
    "url": "/learn"
  }
}
```

### Form

```json
{
  "type": "form",
  "title": "Subscribe",
  "fields": [
    {
      "name": "email",
      "type": "email",
      "label": "Email",
      "placeholder": "your@email.com",
      "required": true
    }
  ],
  "submitText": "Subscribe"
}
```

## UI Variants

- `modal`: Centered modal
- `banner-top`: Top banner
- `banner-bottom`: Bottom banner
- `slide-in-right`: Right sidebar
- `slide-in-left`: Left sidebar
- `corner-popup`: Bottom-right popup
- `fullscreen-takeover`: Full-screen overlay
- `inline`: Inline content

## Example: Welcome Popup

```jsx
<PlacementHost
  placementSlug="welcome-popup"
  trigger="onLoad"
  autoTrack={true}
  onConversion={(goalId) => {
    console.log('User converted:', goalId);
    // Track in your analytics
  }}
/>
```

## Example: Exit Intent

```jsx
<PlacementHost
  placementSlug="exit-offer"
  trigger="onExit"
  onClose={() => {
    console.log('User closed exit popup');
  }}
/>
```

## Example: Custom Rendering

```jsx
<PlacementHost placementSlug="custom-banner">
  {({ decision, content, handleClose, handleConversion }) => (
    <div className="my-custom-banner">
      <h1>{content.title}</h1>
      <button onClick={() => {
        handleConversion('signup', 0);
        window.location.href = content.cta.url;
      }}>
        {content.cta.text}
      </button>
      <button onClick={handleClose}>×</button>
    </div>
  )}
</PlacementHost>
```

## TypeScript Support

TypeScript definitions are included. Import types:

```typescript
import { PlacementDecision, PlacementExperience, TrackingContext } from '@contexthub/promo-sdk';
```

## License

MIT
