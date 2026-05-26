/**
 * JourneyCard.tsx
 *
 * Displays a single journey from the SimplyGo statement alongside
 * its estimated adult fare and savings.
 */

import type { Journey, FareResult } from '../types'
import { ModeChip } from './ModeChip'
import { formatFare } from '../fare/computeFare'

interface JourneyCardProps {
  journey: Journey
  fareResult: FareResult
  /** The actual amount charged by SimplyGo (in cents) */
  chargedCents: number
}

function formatDate(isoDate: string): { day: string; monthYear: string } {
  const d = new Date(isoDate + 'T12:00:00') // noon to avoid DST edge cases
  const day = d.getDate().toString()
  const monthYear = d.toLocaleDateString('en-SG', { month: 'short', year: 'numeric' })
  return { day, monthYear }
}

export function JourneyCard({ journey, fareResult, chargedCents }: JourneyCardProps) {
  const { day, monthYear } = formatDate(journey.date)

  const adultFare = fareResult.fare
  const savingsCents = adultFare !== null ? adultFare - chargedCents : null
  const isUnpriced = adultFare === null
  const isPassUsage = chargedCents === 0

  return (
    <article
      className="rounded-2xl bg-surface-card border border-surface-border p-4 flex gap-3"
      aria-label={`Journey on ${journey.date}: ${journey.origin} to ${journey.destination}`}
    >
      {/* Date column */}
      <div className="flex flex-col items-center min-w-[44px] pt-0.5">
        <span className="text-2xl font-bold text-ink-DEFAULT leading-none">{day}</span>
        <span className="text-xs text-ink-muted mt-0.5 text-center leading-tight">{monthYear}</span>
        <span className="text-xs text-ink-muted mt-1 font-medium">{journey.dayOfWeek}</span>
      </div>

      {/* Divider */}
      <div className="w-px bg-surface-border self-stretch" aria-hidden="true" />

      {/* Journey details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-DEFAULT truncate">
          {journey.origin}
          <span className="text-ink-muted font-normal mx-1" aria-hidden="true">→</span>
          <span className="sr-only">to </span>
          {journey.destination}
        </p>

        {/* Legs */}
        <div className="mt-2 flex flex-wrap gap-1.5" role="list" aria-label="Journey legs">
          {journey.legs.map((leg, idx) => (
            <div key={idx} className="flex items-center gap-1.5" role="listitem">
              <span className="text-xs text-ink-muted">{leg.time}</span>
              <ModeChip mode={leg.mode} service={leg.busService} />
            </div>
          ))}
        </div>

        {/* Adjustments (fuzzy match warnings, etc.) */}
        {fareResult.adjustments.filter(a => a.label.includes('Low-confidence')).length > 0 && (
          <div className="mt-2" role="alert">
            {fareResult.adjustments
              .filter(a => a.label.includes('Low-confidence'))
              .map((a, i) => (
                <p key={i} className="text-xs text-amber-600">
                  <span aria-hidden="true">⚠ </span>{a.label}
                </p>
              ))}
          </div>
        )}
      </div>

      {/* Fare column */}
      <div className="flex flex-col items-end justify-start min-w-[80px] gap-1">
        {isPassUsage ? (
          <span className="text-xs font-medium text-brand-purple bg-brand-purple/10 rounded-full px-2 py-0.5">
            Pass
          </span>
        ) : (
          <>
            <span className="text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full px-2 py-0.5">
              Fare
            </span>
            <span className="text-sm font-semibold text-ink-DEFAULT">
              {formatFare(chargedCents)}
            </span>
            {adultFare !== null && adultFare !== chargedCents && (
              <span className="text-xs text-ink-muted">
                Est. {formatFare(adultFare)}
              </span>
            )}
          </>
        )}

        {isUnpriced ? (
          <span
            className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 inline-flex items-center gap-1"
            title={fareResult.reason}
          >
            <span aria-hidden="true">⚠</span>
            <span>Unpriced</span>
          </span>
        ) : (
          isPassUsage && savingsCents !== null && savingsCents > 0 && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
              −{formatFare(savingsCents)}
            </span>
          )
        )}
      </div>
    </article>
  )
}
