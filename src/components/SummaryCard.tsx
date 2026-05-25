/**
 * SummaryCard.tsx
 *
 * Displays the total savings summary for a parsed statement.
 */

import type { Statement, FareResult } from '../types'
import { formatFare } from '../fare/computeFare'

interface SummaryCardProps {
  statement: Statement
  fareResults: FareResult[]
}

export function SummaryCard({ statement, fareResults }: SummaryCardProps) {
  // Compute totals
  let totalAdultFareCents = 0
  let totalChargedCents = 0
  let unpricedCount = 0

  for (let i = 0; i < statement.journeys.length; i++) {
    const journey = statement.journeys[i]!
    const result = fareResults[i]

    const chargedCents = Math.round(journey.charged * 100)
    totalChargedCents += chargedCents

    if (result && result.fare !== null) {
      totalAdultFareCents += result.fare
    } else {
      unpricedCount++
    }
  }

  const pricedJourneys = statement.journeys.length - unpricedCount
  const totalSavingsCents = totalAdultFareCents - totalChargedCents

  return (
    <section
      className="rounded-2xl border-2 border-brand-purple bg-white p-5 md:p-6"
      aria-labelledby="summary-heading"
    >
      <h2 id="summary-heading" className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-4">
        {statement.monthLabel} Summary
      </h2>

      {/* Savings hero */}
      <div className="text-center py-2 mb-4">
        <p className="text-sm text-ink-muted mb-1">Total concession savings</p>
        {totalSavingsCents > 0 ? (
          <p className="text-4xl font-bold text-brand-purple" aria-live="polite">
            {formatFare(totalSavingsCents)}
          </p>
        ) : (
          <p className="text-4xl font-bold text-ink-muted" aria-live="polite">
            —
          </p>
        )}
        <p className="text-xs text-ink-muted mt-1">
          versus estimated adult card fares
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatBlock
          label="Journeys analysed"
          value={`${pricedJourneys} / ${statement.journeys.length}`}
        />
        <StatBlock
          label="Total charged"
          value={formatFare(totalChargedCents)}
        />
        <StatBlock
          label="Est. adult fare"
          value={pricedJourneys > 0 ? formatFare(totalAdultFareCents) : '—'}
        />
        <StatBlock
          label="Statement total"
          value={formatFare(Math.round(statement.totalCharged * 100))}
        />
      </div>

      {/* Unpriced warning */}
      {unpricedCount > 0 && (
        <div
          className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2"
          role="alert"
        >
          <span className="text-amber-500 text-sm mt-0.5" aria-hidden="true">⚠</span>
          <p className="text-xs text-amber-700">
            <strong>{unpricedCount} {unpricedCount === 1 ? 'journey' : 'journeys'}</strong> could not
            be priced due to unrecognised stops or missing route data. Savings may be understated.
          </p>
        </div>
      )}
    </section>
  )
}

interface StatBlockProps {
  label: string
  value: string
}

function StatBlock({ label, value }: StatBlockProps) {
  return (
    <div className="rounded-xl bg-surface-card border border-surface-border p-3">
      <p className="text-xs text-ink-muted mb-0.5">{label}</p>
      <p className="text-base font-semibold text-ink-DEFAULT">{value}</p>
    </div>
  )
}
