import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Copy } from 'lucide-react';
import ContentEditor from './ContentEditor';
import TargetingRules from './TargetingRules';
import UIConfig from './UIConfig';

export default function ExperienceBuilder({
  experience,
  index,
  onUpdate,
  onDelete,
  canDelete
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('content');

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
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'content' && (
              <ContentEditor
                content={experience.content}
                onChange={(content) => handleUpdate('content', content)}
              />
            )}

            {activeTab === 'targeting' && (
              <TargetingRules
                targeting={experience.targeting}
                onChange={(targeting) => handleUpdate('targeting', targeting)}
              />
            )}

            {activeTab === 'ui' && (
              <UIConfig
                ui={experience.ui}
                trigger={experience.trigger}
                onUIChange={(ui) => handleUpdate('ui', ui)}
                onTriggerChange={(trigger) => handleUpdate('trigger', trigger)}
              />
            )}

            {activeTab === 'schedule' && (
              <ScheduleConfig
                schedule={experience.schedule}
                onChange={(schedule) => handleUpdate('schedule', schedule)}
              />
            )}

            {activeTab === 'frequency' && (
              <FrequencyConfig
                frequencyCap={experience.frequencyCap}
                conversionGoals={experience.conversionGoals}
                onFrequencyChange={(frequencyCap) => handleUpdate('frequencyCap', frequencyCap)}
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
            value={schedule.startDate ? new Date(schedule.startDate).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleUpdate('startDate', e.target.value ? new Date(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date
          </label>
          <input
            type="datetime-local"
            value={schedule.endDate ? new Date(schedule.endDate).toISOString().slice(0, 16) : ''}
            onChange={(e) => handleUpdate('endDate', e.target.value ? new Date(e.target.value) : null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Days of Week
        </label>
        <div className="flex gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
            <button
              key={day}
              onClick={() => {
                const daysOfWeek = schedule.daysOfWeek || [];
                const newDays = daysOfWeek.includes(idx)
                  ? daysOfWeek.filter(d => d !== idx)
                  : [...daysOfWeek, idx];
                handleUpdate('daysOfWeek', newDays);
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                (schedule.daysOfWeek || []).includes(idx)
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
