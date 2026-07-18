import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Code2,
  Monitor,
  Moon,
  Play,
  RefreshCw,
  Smartphone,
  Sun,
  TestTube2,
  Webhook,
  XCircle
} from 'lucide-react';
import { apiClient as api } from '../../../lib/api';
import { useAuth } from '../../../contexts/AuthContext.jsx';

const channelLabels = {
  modal: 'Popup',
  'banner-top': 'Üst banner',
  'banner-bottom': 'Alt banner',
  'slide-in-right': 'Sağ slide-in',
  'slide-in-left': 'Sol slide-in',
  'corner-popup': 'Köşe popup',
  'fullscreen-takeover': 'Fullscreen',
  inline: 'Inline',
  toast: 'Notification prompt'
};

const contentLabels = {
  text: 'Text & CTA',
  html: 'Custom HTML',
  form: 'ContextHub Form',
  component: 'Component',
  external: 'External URL',
  image: 'Image',
  video: 'Video'
};

function getText(value, fallback = '') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.tr || value.en || Object.values(value)[0] || fallback;
}

function getExperienceContent(experience = {}) {
  if (experience.content) return experience.content;
  const payload = experience.payload || {};
  return {
    type: experience.contentType || 'text',
    ...payload
  };
}

function formatDate(value) {
  if (!value) return 'Yok';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonObject(value, fallback = {}) {
  if (!value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function PlacementWorkbench({ placement }) {
  const [activeTab, setActiveTab] = useState('preview');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const experiences = placement.experiences || [];
  const experience = experiences[selectedIndex] || experiences[0] || null;

  const workflow = useMemo(() => {
    const ui = experience?.ui || {};
    const rules = experience?.rules || {};
    const trigger = experience?.trigger || rules.trigger || {};
    return {
      channel: channelLabels[ui.variant] || ui.variant || 'Kanal seçilmedi',
      content: contentLabels[experience?.contentType] || experience?.contentType || 'İçerik seçilmedi',
      behavior: `${trigger.type || 'onLoad'} · ${(rules.paths || []).length || 0} path · ${rules.frequency?.capKey || 'cap yok'}`
    };
  }, [experience]);

  return (
    <aside className="lg:sticky lg:top-6 h-fit rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Placement Workbench</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Preview, debug ve cache görünürlüğü</h2>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-200 text-sm">
        {[
          ['preview', Monitor, 'Preview'],
          ['debug', TestTube2, 'Debug'],
          ['webhooks', Webhook, 'Webhooks']
        ].map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center justify-center gap-2 px-3 py-3 font-medium transition ${
              activeTab === key
                ? 'bg-slate-950 text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {experiences.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-500">Experience</label>
            <select
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {experiences.map((item, index) => (
                <option key={item._id || item.id || index} value={index}>
                  {item.name || `Experience ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <WorkflowStrip workflow={workflow} />

        {activeTab === 'preview' && <PresentationPreview placement={placement} experience={experience} />}
        {activeTab === 'debug' && <DecisionDebugger placement={placement} />}
        {activeTab === 'webhooks' && <WebhookVisibility placement={placement} />}
      </div>
    </aside>
  );
}

function WorkflowStrip({ workflow }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      {[
        ['Kanal', workflow.channel],
        ['İçerik', workflow.content],
        ['Davranış', workflow.behavior]
      ].map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-xs font-medium text-slate-900" title={value}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function PresentationPreview({ placement, experience }) {
  const [device, setDevice] = useState('desktop');
  const [theme, setTheme] = useState('light');
  const [visible, setVisible] = useState(true);
  const [mode, setMode] = useState('render');

  if (!experience) {
    return <EmptyState title="Preview için experience yok" description="Önce en az bir experience ekleyin." />;
  }

  const content = getExperienceContent(experience);
  const ui = experience.ui || {};
  const trigger = experience.trigger || experience.rules?.trigger || { type: 'onLoad' };
  const previewPayload = {
    placement: { slug: placement.slug, name: placement.name, category: placement.category },
    experience: { name: experience.name, contentType: experience.contentType, content, ui, trigger }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentButton active={device === 'desktop'} onClick={() => setDevice('desktop')} icon={Monitor} label="Desktop" />
        <SegmentButton active={device === 'mobile'} onClick={() => setDevice('mobile')} icon={Smartphone} label="Mobile" />
        <SegmentButton active={theme === 'light'} onClick={() => setTheme('light')} icon={Sun} label="Light" />
        <SegmentButton active={theme === 'dark'} onClick={() => setTheme('dark')} icon={Moon} label="Dark" />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <p className="text-xs font-medium text-slate-500">Trigger simulation</p>
          <p className="text-sm font-semibold text-slate-900">{trigger.type || 'onLoad'}</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Play size={14} />
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>

      <div className="flex rounded-lg border border-slate-200 p-1">
        <button
          type="button"
          onClick={() => setMode('render')}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode === 'render' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}
        >
          Render
        </button>
        <button
          type="button"
          onClick={() => setMode('json')}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode === 'json' ? 'bg-slate-950 text-white' : 'text-slate-600'}`}
        >
          SDK JSON
        </button>
      </div>

      {mode === 'json' ? (
        <pre className="max-h-[360px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {JSON.stringify(previewPayload, null, 2)}
        </pre>
      ) : (
        <div
          className={`relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-lg border ${
            theme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-100'
          }`}
        >
          <div className={`${device === 'mobile' ? 'w-[240px]' : 'w-full max-w-[360px]'} transition-all`}>
            {visible ? (
              <RenderedPlacement content={content} ui={ui} />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-400 p-6 text-center text-sm text-slate-500">
                Placement hidden
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RenderedPlacement({ content, ui }) {
  const style = {
    backgroundColor: ui.backgroundColor || '#ffffff',
    color: ui.textColor || '#111827',
    borderRadius: ui.borderRadius || '8px',
    padding: ui.padding || '20px',
    boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)'
  };

  return (
    <div className="relative border border-slate-200" style={style}>
      {ui.showCloseButton !== false && (
        <button type="button" className="absolute right-2 top-2 text-lg leading-none text-slate-400">×</button>
      )}
      {content.type === 'html' && <div dangerouslySetInnerHTML={{ __html: content.html || '<p>HTML preview</p>' }} />}
      {content.type === 'text' && (
        <div>
          <h3 className="pr-6 text-lg font-semibold">{getText(content.title, 'Başlık')}</h3>
          <p className="mt-2 text-sm opacity-80">{getText(content.message, 'Mesaj içeriği burada görünür.')}</p>
          {content.cta?.text && (
            <button type="button" className="mt-4 rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ui.buttonColor || '#2563eb' }}>
              {getText(content.cta.text)}
            </button>
          )}
        </div>
      )}
      {content.type === 'form' && <FormPreview content={content} ui={ui} />}
      {content.type === 'image' && (
        <div>
          {content.imageUrl ? <img src={content.imageUrl} alt={content.alt || ''} className="max-h-56 w-full rounded object-cover" /> : <div className="rounded bg-slate-100 p-8 text-center text-sm text-slate-500">Image URL bekleniyor</div>}
        </div>
      )}
      {content.type === 'video' && <div className="rounded bg-slate-900 p-10 text-center text-sm text-white">Video preview</div>}
      {content.type === 'component' && <div className="text-sm">Component: <strong>{content.componentId || 'component-id'}</strong></div>}
      {content.type === 'external' && <div className="text-sm">External URL: <strong>{content.externalUrl || 'https://...'}</strong></div>}
    </div>
  );
}

function FormPreview({ content, ui }) {
  const fields = content.form?.fields || content.fields || [];
  return (
    <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
      <h3 className="pr-6 text-lg font-semibold">{getText(content.title || content.form?.title, 'Form')}</h3>
      {(fields.length ? fields : [{ name: 'email', label: 'Email', type: 'email', required: true }]).slice(0, 4).map((field) => (
        <label key={field.id || field.name} className="block">
          <span className="text-xs font-medium opacity-80">{getText(field.label, field.name)} {field.required ? '*' : ''}</span>
          <input
            type={field.type === 'email' ? 'email' : 'text'}
            name={field.name}
            disabled
            placeholder={getText(field.placeholder)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </label>
      ))}
      <button type="button" className="rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ui.buttonColor || '#2563eb' }}>
        {getText(content.submitText || content.settings?.submitButtonText, 'Submit')}
      </button>
      <p className="text-[11px] text-slate-500">Dry-run: submit API çağrısı yapılmaz.</p>
    </form>
  );
}

function DecisionDebugger({ placement }) {
  const [context, setContext] = useState({
    path: '/',
    locale: 'tr',
    device: 'desktop',
    browser: 'chrome',
    os: 'macos',
    authenticated: false,
    userTags: '',
    featureFlags: '',
    seenCaps: '{}'
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runDebug = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/placements/debug-decision', {
        placement,
        context: {
          path: context.path || '/',
          locale: context.locale || undefined,
          device: context.device || undefined,
          browser: context.browser || undefined,
          os: context.os || undefined,
          authenticated: Boolean(context.authenticated),
          sessionId: 'admin-preview-session',
          userTags: parseCsv(context.userTags),
          featureFlags: parseCsv(context.featureFlags),
          seenCaps: parseJsonObject(context.seenCaps)
        }
      });
      setResult(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Decision debug çalıştırılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Path" value={context.path} onChange={(value) => setContext({ ...context, path: value })} />
        <Field label="Locale" value={context.locale} onChange={(value) => setContext({ ...context, locale: value })} />
        <SelectField label="Device" value={context.device} onChange={(value) => setContext({ ...context, device: value })} options={['desktop', 'mobile', 'tablet']} />
        <Field label="Browser" value={context.browser} onChange={(value) => setContext({ ...context, browser: value })} />
        <Field label="User tags" value={context.userTags} onChange={(value) => setContext({ ...context, userTags: value })} placeholder="vip, returning" />
        <Field label="Feature flags" value={context.featureFlags} onChange={(value) => setContext({ ...context, featureFlags: value })} placeholder="new-pricing" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={context.authenticated}
          onChange={(event) => setContext({ ...context, authenticated: event.target.checked })}
          className="rounded border-slate-300"
        />
        Authenticated user
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Session caps JSON</span>
        <textarea
          value={context.seenCaps}
          onChange={(event) => setContext({ ...context, seenCaps: event.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </label>

      <button
        type="button"
        onClick={runDebug}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        <TestTube2 size={16} />
        {loading ? 'Test ediliyor...' : 'Decision test et'}
      </button>

      {error && <StateMessage tone="error" title="Debug hatası" description={error} />}
      {!error && !result && <EmptyState title="Henüz test edilmedi" description="Context değerlerini girip decision sonucunu görün." />}
      {result && <DebugResult result={result} />}
    </div>
  );
}

function DebugResult({ result }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-medium text-slate-500">Selected experience</p>
        {result.selected ? (
          <div className="mt-2 flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-950">{result.selected.name}</p>
              <p className="text-xs text-slate-500">Priority {result.selected.priority} · Weight {result.selected.weight}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Uygun experience yok.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Rejected</p>
        {result.rejected?.length ? (
          <div className="space-y-2">
            {result.rejected.map((item) => (
              <div key={item.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="flex items-start gap-2">
                  <XCircle size={16} className="mt-0.5 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-red-950">{item.name}</p>
                    <ul className="mt-1 space-y-1 text-xs text-red-800">
                      {item.reasons.map((reason) => (
                        <li key={`${item.id}-${reason.code}`}>{reason.label}: {reason.detail}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Elenecek experience yok.</p>
        )}
      </div>
    </div>
  );
}

function WebhookVisibility({ placement }) {
  const { activeTenantId: tenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);

  const loadQueue = async () => {
    if (!tenantId) {
      setError('Tenant bilgisi bulunamadı.');
      return;
    }
    setLoading(true);
    setError('');
    setPermissionDenied(false);
    try {
      const response = await api.get(`/admin/tenants/${tenantId}/webhooks/queue`, { params: { limit: 6 } });
      setQueue(response.data);
    } catch (requestError) {
      if ([401, 403].includes(requestError?.response?.status)) {
        setPermissionDenied(true);
      } else {
        setError(requestError?.response?.data?.error || 'Webhook durumu yüklenemedi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <BellRing size={16} className="text-slate-700" />
          <p className="text-sm font-semibold text-slate-950">Cache refresh görünürlüğü</p>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Placement güncellemeleri `placement.*` domain eventleri üretir. App tarafı cache yeniliyorsa son queue/outbox durumunu buradan kontrol edin.
        </p>
      </div>

      <button
        type="button"
        onClick={loadQueue}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        <RefreshCw size={16} />
        {loading ? 'Yükleniyor...' : 'Webhook durumunu yenile'}
      </button>

      {loading && <SkeletonList />}
      {permissionDenied && <StateMessage tone="warning" title="Yetki gerekli" description="Webhook queue görünürlüğü için tenant görüntüleme veya yönetim yetkisi gerekiyor." />}
      {error && <StateMessage tone="error" title="Webhook durumu alınamadı" description={error} />}
      {!loading && !error && !permissionDenied && !queue && <EmptyState title="Durum henüz yüklenmedi" description="Son domain event ve outbox durumunu görmek için yenileyin." />}
      {queue && <QueueSummary queue={queue} placement={placement} />}
    </div>
  );
}

function QueueSummary({ queue, placement }) {
  const domainItems = queue.domainEvents?.items || [];
  const pendingItems = queue.outbox?.pendingItems || [];
  const failedItems = queue.outbox?.failedItems || [];
  const placementEvents = domainItems.filter((item) => !placement.slug || item.type?.startsWith('placement.'));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Domain pending" value={queue.domainEvents?.totalPending || 0} />
        <Metric label="Outbox pending" value={queue.outbox?.totalPending || 0} />
        <Metric label="Failed" value={queue.outbox?.totalFailed || 0} />
      </div>

      <EventList title="Son placement domain eventleri" items={placementEvents} empty="Bekleyen placement event yok." />
      <EventList title="Pending outbox" items={pendingItems} empty="Bekleyen delivery yok." />
      <EventList title="Failed outbox" items={failedItems} empty="Başarısız delivery yok." tone="error" />
    </div>
  );
}

function EventList({ title, items, empty, tone = 'default' }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</p>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id || item.eventId || `${item.type}-${item.createdAt}`} className={`rounded-lg border p-3 ${tone === 'error' ? 'border-red-100 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-slate-900">{item.type}</p>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{item.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatDate(item.occurredAt || item.updatedAt || item.createdAt)}</p>
              {item.lastError && <p className="mt-1 text-xs text-red-700">{item.lastError}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

function SegmentButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
        active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <p className="text-lg font-semibold text-slate-950">{value}</p>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center">
      <Code2 className="mx-auto text-slate-400" size={20} />
      <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function StateMessage({ tone, title, description }) {
  const Icon = tone === 'error' ? AlertCircle : AlertCircle;
  const classes = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${classes}`}>
      <Icon size={16} className="mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5">{description}</p>
      </div>
    </div>
  );
}
