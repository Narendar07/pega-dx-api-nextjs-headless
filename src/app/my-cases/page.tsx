'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCase } from '@/lib/pega-client';

// Shape we extract from GET /cases/{id} for the list view
interface CaseSummary {
  ID: string;
  status: string;
  stageLabel: string;
  createTime: string;
}

export default function MyCasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      let ids: string[] = [];
      try {
        ids = JSON.parse(localStorage.getItem('pega_case_ids') || '[]');
      } catch { /* ignore */ }

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      const results: CaseSummary[] = [];
      const errs: string[] = [];

      await Promise.all(
        ids.map(async (id) => {
          try {
            const { data } = await getCase(id, 'none');
            const ci = (data as { caseInfo?: Record<string, unknown> }).caseInfo || {};
            results.push({
              ID: String(ci.ID ?? id),
              status: String(ci.status ?? '—'),
              stageLabel: String(ci.stageLabel ?? '—'),
              createTime: String(ci.createTime ?? ''),
            });
          } catch (err) {
            errs.push(`${id}: ${err instanceof Error ? err.message : 'failed'}`);
          }
        })
      );

      // Sort newest first (by createTime, fallback to order in ids array)
      results.sort((a, b) =>
        b.createTime.localeCompare(a.createTime)
      );

      setCases(results);
      setErrors(errs);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">Loading cases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">MediaCo</h1>
              <p className="text-xs text-gray-500">My Cases</p>
            </div>
          </div>
          <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            ← Back to Shop
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">My Cases</h2>

        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-amber-800">Some cases could not be loaded</p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-amber-700 mt-1 font-mono">{e}</p>
            ))}
          </div>
        )}

        {cases.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-lg mb-2">No cases found</p>
            <p className="text-gray-400 text-sm mb-6">
              Cases you create will appear here. Start shopping below.
            </p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Shop Now
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Case ID</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.ID} className="border-b border-gray-100 last:border-0 hover:bg-blue-50 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/pega-case/${encodeURIComponent(c.ID)}`}
                        className="font-mono text-blue-600 hover:underline text-xs"
                      >
                        {c.ID}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{c.stageLabel}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                        ${c.status?.toLowerCase().includes('resolv') || c.status?.toLowerCase().includes('complet')
                          ? 'bg-green-100 text-green-700'
                          : c.status?.toLowerCase() === 'new' || c.status?.toLowerCase().includes('open')
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">
                      {c.createTime ? new Date(c.createTime).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
