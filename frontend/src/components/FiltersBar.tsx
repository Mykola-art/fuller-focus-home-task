import React from 'react'
import { useJobStore } from '../store/useJobStore'
import Button from './Button'

export default function FiltersBar() {
  const { filters, totals } = useJobStore((s) => ({ filters: s.filters, totals: s.totals }))
  const setFilters = useJobStore((s) => s.actions.setFilters)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700">Search</label>
            <input
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              placeholder="Org, name, email..."
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ status: e.target.value as any })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
            >
              <option value="ALL">All ({totals.total})</option>
              <option value="Still employed">Still employed ({totals.still})</option>
              <option value="Left organization">Left org ({totals.left})</option>
              <option value="Unknown">Unknown ({totals.unknown})</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">Confidence</label>
            <select
              value={filters.confidence}
              onChange={(e) => setFilters({ confidence: e.target.value as any })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
            >
              <option value="ALL">All</option>
              <option value="HIGH">HIGH ({totals.high})</option>
              <option value="MEDIUM">MEDIUM ({totals.medium})</option>
              <option value="LOW">LOW ({totals.low})</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">Email</label>
            <select
              value={filters.email}
              onChange={(e) => setFilters({ email: e.target.value as any })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-400"
            >
              <option value="ALL">All</option>
              <option value="Work (verified)">Work (verified)</option>
              <option value="Work (unverified)">Work (unverified)</option>
              <option value="Personal">Personal</option>
              <option value="Not found">Not found</option>
            </select>
          </div>
        </div>

        <Button variant="ghost" onClick={() => setFilters({ q: '', status: 'ALL', confidence: 'ALL', email: 'ALL' })}>
          Clear filters
        </Button>
      </div>
    </div>
  )
}
