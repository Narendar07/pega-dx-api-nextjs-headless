'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getConfig, createCase } from '@/lib/pega-client';

interface PhoneModel {
  name: string;
  guid: string;
  price: string;
  retail: string;
  save: string;
  level: string;
}

export default function HomePage() {
  const router = useRouter();
  const [phones, setPhones] = useState<PhoneModel[]>([]);
  const [caseType, setCaseType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    async function init() {
      try {
        const { data } = await getConfig();
        setPhones(data.phoneModels);
        setCaseType(data.caseType);
        setConnectionStatus('connected');
      } catch (err) {
        console.error('Failed to load config:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect to Pega');
        setConnectionStatus('error');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handlePurchase = async (phone: PhoneModel) => {
    try {
      setCreating(phone.guid);
      setError('');

      const { data } = await createCase(caseType, {
        PhoneModelss: { pyGUID: phone.guid },
      });

      const caseData = data as Record<string, unknown>;
      console.log('=== CREATE CASE RESPONSE ===', JSON.stringify(caseData, null, 2));

      const caseID =
        (caseData as { ID?: string }).ID ||
        (caseData as { data?: { caseInfo?: { ID?: string } } })
          .data?.caseInfo?.ID;

      if (!caseID) throw new Error('No case ID returned from DX API');

      // Persist case ID locally so My Cases page can list it
      try {
        const stored: string[] = JSON.parse(localStorage.getItem('pega_case_ids') || '[]');
        if (!stored.includes(caseID)) stored.unshift(caseID);
        localStorage.setItem('pega_case_ids', JSON.stringify(stored.slice(0, 50)));
      } catch { /* ignore storage errors */ }

      // Extract first assignment + action from createCase response
      // to avoid an extra GET /cases round-trip
      const assignments =
        (caseData as {
          data?: {
            caseInfo?: {
              assignments?: Array<{
                ID: string;
                actions?: Array<{ ID: string; name: string }>;
              }>;
            };
          };
        }).data?.caseInfo?.assignments || [];

      const firstAssignment = assignments[0];
      const firstAction = firstAssignment?.actions?.[0];

      const params = new URLSearchParams();
      if (firstAssignment?.ID) params.set('assignmentID', firstAssignment.ID);
      if (firstAction?.ID) params.set('actionID', firstAction.ID);

      const query = params.toString();
      router.push(
        `/pega-case/${encodeURIComponent(caseID)}${query ? `?${query}` : ''}`
      );
    } catch (err) {
      console.error('Failed to create case:', err);
      setError(err instanceof Error ? err.message : 'Failed to create case');
      setCreating(null);
    }
  };

  const levelColors: Record<string, { bg: string; border: string; badge: string }> = {
    Basic: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700' },
    Silver: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    Gold: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">Connecting to Pega...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">MediaCo</h1>
              <p className="text-xs text-gray-500">Headless DX API V2 POC</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/my-cases"
              className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
            >
              My Cases
            </a>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                connectionStatus === 'connected'
                  ? 'bg-green-50 text-green-700'
                  : connectionStatus === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-gray-50 text-gray-600'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-green-500'
                    : connectionStatus === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                }`}
              />
              {connectionStatus === 'connected'
                ? 'Pega Connected'
                : connectionStatus === 'error'
                  ? 'Connection Error'
                  : 'Checking...'}
            </span>
            <span className="text-xs text-gray-400">Option 4: No ConstellationJS</span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8">
        <div className="text-center mb-4">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">
            Keeping you connected to what matters.
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Choose your new Oceonix phone. This POC creates a Pega case via DX API V2
            REST endpoints — no ConstellationJS, no PCore, no bootstrap-shell.
          </p>
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-red-500 text-lg mt-0.5">⚠</span>
              <div>
                <p className="text-sm font-medium text-red-800">Connection Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <p className="text-xs text-red-500 mt-2">
                  Make sure your Pega server is running and pega-config.json is configured correctly.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phone Cards */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">
          The phones you want at prices you&apos;ll{' '}
          <span className="text-blue-600">love.</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {phones.map((phone) => {
            const colors = levelColors[phone.level] || levelColors.Basic;
            const isCreating = creating === phone.guid;
            return (
              <div
                key={phone.guid}
                className={`${colors.bg} border ${colors.border} rounded-xl p-6 flex flex-col transition-all hover:shadow-lg hover:-translate-y-1`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors.badge}`}>
                    {phone.level}
                  </span>
                  <span className="text-sm font-semibold text-green-600">
                    {phone.save}
                  </span>
                </div>

                <div className="text-center py-6">
                  <div className="w-20 h-32 bg-gray-300 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <span className="text-3xl">📱</span>
                  </div>
                  <h4 className="text-xl font-bold text-gray-900">{phone.name}</h4>
                </div>

                <div className="mt-auto space-y-2">
                  <p className="text-2xl font-bold text-gray-900 text-center">
                    {phone.price}
                  </p>
                  <p className="text-xs text-gray-500 text-center">for 36 months</p>
                  <p className="text-xs text-gray-400 text-center">
                    Retail: {phone.retail}
                  </p>

                  <button
                    onClick={() => handlePurchase(phone)}
                    disabled={isCreating || connectionStatus !== 'connected'}
                    className="w-full mt-4 px-4 py-3 bg-blue-600 text-white text-sm font-medium
                               rounded-lg hover:bg-blue-700 disabled:opacity-50
                               disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Creating case...
                      </span>
                    ) : (
                      'Shop Now'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Architecture Note */}
        <div className="mt-12 bg-white border border-gray-200 rounded-xl p-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            How this POC works (Option 4 Architecture)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-gray-600">
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="font-semibold text-blue-600 block mb-1">1. Shop Now Click</span>
              Next.js client calls POST /api/pega (our proxy route)
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="font-semibold text-blue-600 block mb-1">2. Server Proxy</span>
              Route handler calls POST /api/application/v2/cases with Basic auth
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="font-semibold text-blue-600 block mb-1">3. Parse Response</span>
              Metadata interpreter extracts fields from uiResources tree
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="font-semibold text-blue-600 block mb-1">4. Render Form</span>
              DynamicForm maps field types to React components (our design)
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
