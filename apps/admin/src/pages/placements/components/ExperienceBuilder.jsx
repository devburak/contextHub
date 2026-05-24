import React, { useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Eye, MousePointer2, Trash2 } from 'lucide-react';
import ContentEditor from './ContentEditor';
import TargetingRules from './TargetingRules';
import UIConfig from './UIConfig';

const workflowSteps = [
  {
    key: 'channel',
    label: 'Kanal',
    description: 'Nerede görünecek?',
    icon: Eye,
    tabs: ['ui']
  },
  {
    key: 'content',
    label: 'İçerik',
    description: 'Ne gösterilecek?',
    icon: BellRing,
    tabs: ['content']
  },
  {
    key: 'behavior',
    label: 'Davranış',
    description: 'Ne zaman ve kime?',
    icon: MousePointer2,
    tabs: ['targeting', 'schedule', 'frequency']
  }
];

const tabLabels = {
  content: 'İçerik',
  targeting: 'Hedefleme',
  ui: 'Kanal & UI',
  schedule: 'Zamanlama',
  frequency: 'Frekans'
};

function getActiveStep(activeTab) {
  return workflowSteps.find((step) => step.tabs.includes(activeTab))?.key || 'content';
}

function toEditorContent(experience = {}) {
  if (experience.content) {
    return experience.content;
  }

  const payload = experience.payload || {};
  switch (experience.contentType) {
    case 'html':
      return { type: 'html', html: payload.html || '' };
    case 'form':
      return {
        type: 'form',
        formId: payload.formId || '',
        title: payload.title || '',
        submitText: payload.submitText || '',
        data: payload.data || {}
      };
    case 'component':
      return { type: 'component', componentId: payload.componentId || '', data: payload.data || {} };
    case 'external':
      return { type: 'external', externalUrl: payload.externalUrl || '', data: payload.data || {} };
    case 'image':
      return { type: 'image', imageUrl: payload.imageUrl || '', alt: payload.alt || '', cta: payload.cta };
    case 'video':
      return { type: 'video', videoUrl: payload.videoUrl || '', autoplay: payload.autoplay, controls: payload.controls };
    case 'text':
    default:
      return {
        type: 'text',
        title: payload.title || '',
        message: payload.message || '',
        cta: payload.cta || {}
      };
  }
}

function toExperienceContent(content = {}) {
  switch (content.type) {
    case 'html':
      return {
        contentType: 'html',
        payload: {
          html: content.html || '',
          data: content.data || undefined
        }
      };
    case 'form':
      return {
        contentType: 'form',
        payload: {
          formId: content.formId || undefined,
          title: content.title || undefined,
          submitText: content.submitText || undefined,
          data: content.data || undefined
        }
      };
    case 'component':
      return {
        contentType: 'component',
        payload: {
          componentId: content.componentId || '',
          data: content.data || undefined
        }
      };
    case 'external':
      return {
        contentType: 'external',
        payload: {
          externalUrl: content.externalUrl || '',
          data: content.data || undefined
        }
      };
    case 'image':
      return {
        contentType: 'image',
        payload: {
          imageUrl: content.imageUrl || '',
          alt: content.alt || '',
          cta: content.cta || undefined
        }
      };
    case 'video':
      return {
        contentType: 'video',
        payload: {
          videoUrl: content.videoUrl || '',
          autoplay: Boolean(content.autoplay),
          controls: content.controls !== false
        }
      };
    case 'text':
    default:
      return {
        contentType: 'text',
        payload: {
          title: content.title || '',
          message: content.message || '',
          cta: content.cta || undefined
        }
      };
  }
}

function toEditorTargeting(experience = {}) {
  if (experience.targeting) {
    return experience.targeting;
  }

  const rules = experience.rules || {};
  return {
    paths: rules.paths || [],
    locale: rules.locales || [],
    device: rules.devices || [],
    browser: rules.browsers || [],
    os: rules.os || [],
    requireAuth: rules.authenticated,
    roles: rules.roles || [],
    tags: rules.userTags || [],
    featureFlags: rules.requiredFlags || [],
    query: rules.query || {}
  };
}

function toRulesFromTargeting(targeting = {}, currentRules = {}) {
  return {
    ...currentRules,
    paths: targeting.paths || [],
    locales: targeting.locale || [],
    devices: targeting.device || [],
    browsers: targeting.browser || [],
    os: targeting.os || [],
    authenticated: targeting.requireAuth,
    roles: targeting.roles || [],
    userTags: targeting.tags || [],
    requiredFlags: targeting.featureFlags || [],
    query: targeting.query || {}
  };
}

function toEditorFrequency(frequency = {}) {
  return {
    session: frequency.session ?? frequency.maxPerSession ?? '',
    daily: frequency.daily ?? frequency.maxPerDay ?? '',
    total: frequency.total ?? frequency.maxTotal ?? '',
    capKey: frequency.capKey || '',
    resetOnConversion: Boolean(frequency.resetOnConversion)
  };
}

function toRulesFrequency(frequency = {}) {
  return {
    maxPerSession: frequency.session || frequency.maxPerSession || undefined,
    maxPerDay: frequency.daily || frequency.maxPerDay || undefined,
    maxTotal: frequency.total || frequency.maxTotal || undefined,
    capKey: frequency.capKey || undefined,
    resetOnConversion: Boolean(frequency.resetOnConversion)
  };
}

export default function ExperienceBuilder({
  experience,
  index,
  onUpdate,
  onDelete,
  canDelete
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  const activeStep = getActiveStep(activeTab);

  const handleUpdate = (field, value) => {
    onUpdate({
      ...experience,
      [field]: value
    });
  };

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-600 hover:text-gray-900"
          >
            {collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>
          
          <div className="flex-1">
            <input
              type="text"
              value={experience.name}
              onChange={(e) => handleUpdate('name', e.target.value)}
              className="font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
              placeholder="Experience name"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Weight:</label>
              <input
                type="number"
                value={experience.weight}
                onChange={(e) => handleUpdate('weight', parseInt(e.target.value))}
                min="0"
                max="100"
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Priority:</label>
              <input
                type="number"
                value={experience.priority}
                onChange={(e) => handleUpdate('priority', parseInt(e.target.value))}
                min="0"
                max="100"
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
              />
            </div>

            <select
              value={experience.status}
              onChange={(e) => handleUpdate('status', e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>

            {canDelete && (
              <button
                onClick={onDelete}
                className="text-red-600 hover:text-red-900"
                title="Delete experience"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-4">
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {workflowSteps.map((step) => {
              const Icon = step.icon;
              const isActive = activeStep === step.key;
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveTab(step.tabs[0])}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                    isActive
                      ? 'border-slate-900 bg-slate-950 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-white' : 'text-gray-500'} />
                  <span>
                    <span className="block text-sm font-semibold">{step.label}</span>
                    <span className={`mt-0.5 block text-xs ${isActive ? 'text-slate-200' : 'text-gray-500'}`}>
                      {step.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-4">
            <nav className="flex gap-4">
              {['content', 'targeting', 'ui', 'schedule', 'frequency'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 px-1 border-b-2 text-sm font-medium capitalize ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tabLabels[tab] || tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'content' && (
              <ContentEditor
                content={toEditorContent(experience)}
                onChange={(content) => onUpdate({
                  ...experience,
                  ...toExperienceContent(content),
                  content
                })}
              />
            )}

            {activeTab === 'targeting' && (
              <TargetingRules
                targeting={toEditorTargeting(experience)}
                onChange={(targeting) => onUpdate({
                  ...experience,
                  targeting,
                  rules: toRulesFromTargeting(targeting, experience.rules)
                })}
              />
            )}

            {activeTab === 'ui' && (
              <UIConfig
                ui={experience.ui}
                trigger={experience.trigger || experience.rules?.trigger}
                onUIChange={(ui) => handleUpdate('ui', ui)}
                onTriggerChange={(trigger) => onUpdate({
                  ...experience,
                  trigger,
                  rules: {
                    ...(experience.rules || {}),
                    trigger
                  }
                })}
              />
            )}

            {activeTab === 'schedule' && (
              <ScheduleConfig
                schedule={experience.rules?.schedule || experience.schedule}
                onChange={(schedule) => onUpdate({
                  ...experience,
                  schedule,
                  rules: {
                    ...(experience.rules || {}),
                    schedule
                  }
                })}
              />
            )}

            {activeTab === 'frequency' && (
              <FrequencyConfig
                frequencyCap={toEditorFrequency(experience.rules?.frequency || experience.frequencyCap)}
                conversionGoals={experience.conversions?.goals || experience.conversionGoals}
                onFrequencyChange={(frequencyCap) => onUpdate({
                  ...experience,
                  frequencyCap,
                  rules: {
                    ...(experience.rules || {}),
                    frequency: toRulesFrequency(frequencyCap)
                  }
                })}
                onGoalsChange={(goals) => handleUpdate('conversionGoals', goals)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Schedule Config Component
function ScheduleConfig({ schedule = {}, onChange }) {
  const handleUpdate = (field, value) => {
    onChange({
      ...schedule,
      [field]: value
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date
          </label>
          <input
            type="datetime-local"
            value={schedule.startAt ? new Date(schedule.startAt).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleUpdate('startAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date
          </label>
          <input
            type="datetime-local"
            value={schedule.endAt ? new Date(schedule.endAt).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleUpdate('endAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Days of Week
        </label>
        <div className="flex gap-2">
          {[
            ['Sun', 0],
            ['Mon', 1],
            ['Tue', 2],
            ['Wed', 3],
            ['Thu', 4],
            ['Fri', 5],
            ['Sat', 6]
          ].map(([day, value]) => (
            <button
              key={day}
              onClick={() => {
                const daysOfWeek = schedule.daysOfWeek || [];
                const newDays = daysOfWeek.includes(value)
                  ? daysOfWeek.filter(d => d !== value)
                  : [...daysOfWeek, value];
                handleUpdate('daysOfWeek', newDays);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                (schedule.daysOfWeek || []).includes(value)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Timezone
        </label>
        <input
          type="text"
          value={schedule.timezone || 'UTC'}
          onChange={(e) => handleUpdate('timezone', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          placeholder="UTC"
        />
      </div>
    </div>
  );
}

// Frequency Config Component
function FrequencyConfig({ frequencyCap = {}, conversionGoals = [], onFrequencyChange, onGoalsChange }) {
  const handleFrequencyUpdate = (field, value) => {
    onFrequencyChange({
      ...frequencyCap,
      [field]: value
    });
  };

  const handleAddGoal = () => {
    onGoalsChange([
      ...conversionGoals,
      { id: `goal-${Date.now()}`, name: 'New Goal', type: 'click', value: 0 }
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Frequency Cap */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">Frequency Cap</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-2">Per Session</label>
            <input
              type="number"
              value={frequencyCap.session || ''}
              onChange={(e) => handleFrequencyUpdate('session', parseInt(e.target.value) || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Unlimited"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Per Day</label>
            <input
              type="number"
              value={frequencyCap.daily || ''}
              onChange={(e) => handleFrequencyUpdate('daily', parseInt(e.target.value) || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Unlimited"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-2">Total</label>
            <input
              type="number"
              value={frequencyCap.total || ''}
              onChange={(e) => handleFrequencyUpdate('total', parseInt(e.target.value) || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm text-gray-600 mb-2">Cap Key (optional)</label>
          <input
            type="text"
            value={frequencyCap.capKey || ''}
            onChange={(e) => handleFrequencyUpdate('capKey', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="custom-cap-key"
          />
          <p className="text-xs text-gray-500 mt-1">Use same key across experiences for shared frequency cap</p>
        </div>
      </div>

      {/* Conversion Goals */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-gray-900">Conversion Goals</h3>
          <button
            onClick={handleAddGoal}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Goal
          </button>
        </div>

        <div className="space-y-2">
          {conversionGoals.map((goal, index) => (
            <div key={goal.id} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <input
                type="text"
                value={goal.name}
                onChange={(e) => {
                  const newGoals = [...conversionGoals];
                  newGoals[index].name = e.target.value;
                  onGoalsChange(newGoals);
                }}
                className="flex-1 px-3 py-1 border border-gray-300 rounded"
                placeholder="Goal name"
              />
              
              <select
                value={goal.type}
                onChange={(e) => {
                  const newGoals = [...conversionGoals];
                  newGoals[index].type = e.target.value;
                  onGoalsChange(newGoals);
                }}
                className="px-3 py-1 border border-gray-300 rounded"
              >
                <option value="click">Click</option>
                <option value="submit">Submit</option>
                <option value="custom">Custom</option>
              </select>

              <button
                onClick={() => {
                  onGoalsChange(conversionGoals.filter((_, i) => i !== index));
                }}
                className="text-red-600 hover:text-red-900"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
