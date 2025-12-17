import React from 'react'
import Badge from './Badge'
import type { ResultRow } from '../api/client'

function statusTone(s: ResultRow['current_status']) {
  if (s === 'Still employed') return 'green'
  if (s === 'Left organization') return 'red'
  return 'orange'
}
function confidenceTone(c: ResultRow['confidence_level']) {
  if (c === 'HIGH') return 'green'
  if (c === 'MEDIUM') return 'orange'
  return 'red'
}
function emailTone(t: ResultRow['email_type']) {
  if (t === 'Work (verified)') return 'green'
  if (t === 'Work (unverified)') return 'orange'
  if (t === 'Personal') return 'red'
  return 'gray'
}

export default function ResultsTable({ rows }: { rows: ResultRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="overflow-auto">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-xs font-bold text-gray-700">EIN</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Organization</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Website</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Employee</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Input title</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Current status</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Current title</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Email</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Email type</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Confidence</th>
              <th className="px-4 py-3 text-xs font-bold text-gray-700">Cost/rec</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.filer_ein}-${idx}`} className={idx % 2 ? 'bg-gray-50/60' : 'bg-white'}>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.filer_ein}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{r.org_name}</td>
                <td className="px-4 py-3">
                  {r.website ? (
                    <a className="text-primary-700 hover:underline" href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer">
                      {r.website}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{r.employee_name}</td>
                <td className="px-4 py-3 text-gray-700">{r.employee_title || '—'}</td>
                <td className="px-4 py-3"><Badge tone={statusTone(r.current_status)}>{r.current_status}</Badge></td>
                <td className="px-4 py-3 text-gray-700">{r.current_title || '—'}</td>
                <td className="px-4 py-3">
                  {r.verified_email ? <span className="font-mono text-xs">{r.verified_email}</span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3"><Badge tone={emailTone(r.email_type)}>{r.email_type}</Badge></td>
                <td className="px-4 py-3"><Badge tone={confidenceTone(r.confidence_level)}>{r.confidence_level}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">${r.cost_per_record}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-gray-500" colSpan={11}>
                  No rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
