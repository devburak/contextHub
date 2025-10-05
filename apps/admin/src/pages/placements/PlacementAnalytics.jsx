import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Eye, MousePointer, Target, X, Monitor, Globe } from 'lucide-react';
import { apiClient as api } from '../../lib/api';

export default function PlacementAnalytics() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [placement, setPlacement] = useState(null);
  const [dateRange, setDateRange] = useState('30d');
  const [totals, setTotals] = useState({});
  const [stats, setStats] = useState([]);
  const [abTest, setABTest] = useState(null);
  const [funnel, setFunnel] = useState({ steps: [] });
  const [devices, setDevices] = useState([]);
  const [browsers, setBrowsers] = useState([]);
  const [topPages, setTopPages] = useState([]);

  useEffect(() => {
    fetchData();
  }, [id, dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [placementRes, totalsRes, statsRes, abTestRes, devicesRes, browsersRes, pagesRes] = await Promise.all([
        api.get(`/placements/${id}`),
        api.get(`/placements/${id}/stats/totals?${getDateParams()}`),
        api.get(`/placements/${id}/stats?${getDateParams()}`),
        api.get(`/placements/${id}/ab-test?${getDateParams()}`),
        api.get(`/placements/${id}/stats/devices?${getDateParams()}`),
        api.get(`/placements/${id}/stats/browsers?${getDateParams()}`),
        api.get(`/placements/${id}/stats/top-pages?${getDateParams()}`)
      ]);

      setPlacement(placementRes.data);
      setTotals(totalsRes.data);
      setStats(statsRes.data);
      setABTest(abTestRes.data);
      setDevices(devicesRes.data);
      setBrowsers(browsersRes.data);
      setTopPages(pagesRes.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateParams = () => {
    const now = new Date();
    let startDate;

    switch (dateRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return `startDate=${startDate.toISOString()}&endDate=${now.toISOString()}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/placements" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500 mt-1">{placement?.name}</p>
          </div>
        </div>

        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Impressions"
          value={totals.impressions?.toLocaleString() || 0}
          icon={<Eye />}
          color="blue"
        />
        <MetricCard
          title="Views"
          value={totals.views?.toLocaleString() || 0}
          subtext={`${totals.viewRate || 0}% view rate`}
          icon={<Monitor />}
          color="green"
        />
        <MetricCard
          title="Clicks"
          value={totals.clicks?.toLocaleString() || 0}
          subtext={`${totals.clickRate || 0}% CTR`}
          icon={<MousePointer />}
          color="purple"
        />
        <MetricCard
          title="Conversions"
          value={totals.conversions?.toLocaleString() || 0}
          subtext={`${totals.conversionRate || 0}% CVR`}
          icon={<Target />}
          color="orange"
        />
      </div>

      {/* A/B Test Results */}
      {abTest && abTest.experiences.length > 1 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">A/B Test Results</h2>
          
          <div className="space-y-4">
            {abTest.experiences.map((exp) => (
              <div key={exp.experienceId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{exp.name}</h3>
                    <p className="text-sm text-gray-500">
                      Weight: {exp.weight}% • Priority: {exp.priority}
                    </p>
                  </div>
                  {abTest.winner?.experienceId === exp.experienceId && (
                    <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                      🏆 Winner
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Impressions</div>
                    <div className="text-lg font-semibold">{exp.impressions?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Views</div>
                    <div className="text-lg font-semibold">{exp.views?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Clicks</div>
                    <div className="text-lg font-semibold">{exp.clicks?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Conversions</div>
                    <div className="text-lg font-semibold">{exp.conversions?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">CVR</div>
                    <div className="text-lg font-semibold text-green-600">{exp.conversionRate}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Device & Browser Breakdown */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">By Device</h2>
          <div className="space-y-3">
            {devices.map((device) => (
              <div key={device.device} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{device.device}</span>
                <div className="text-right">
                  <div className="text-sm font-medium">{device.impressions.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{device.conversionRate}% CVR</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">By Browser</h2>
          <div className="space-y-3">
            {browsers.map((browser) => (
              <div key={browser.browser} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{browser.browser}</span>
                <div className="text-right">
                  <div className="text-sm font-medium">{browser.impressions.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{browser.conversionRate}% CVR</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Pages */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Top Converting Pages</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-4 text-sm font-medium text-gray-600">Page</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-600">Conversions</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-600">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topPages.map((page, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-2 px-4 text-sm text-gray-900">{page.path}</td>
                  <td className="py-2 px-4 text-sm text-gray-900 text-right">{page.conversions}</td>
                  <td className="py-2 px-4 text-sm text-gray-900 text-right">
                    ${page.revenue.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtext, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{title}</span>
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtext && <div className="text-sm text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}
