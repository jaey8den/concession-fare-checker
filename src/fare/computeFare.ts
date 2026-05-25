/**
 * computeFare.ts
 *
 * Computes the adult fare (in cents) for a SimplyGo journey using
 * Singapore's distance-based fare table and LTA reference data.
 *
 * All inputs are pure data structures — no network calls, no side effects.
 */

import type { Journey, Leg, FareResult, FareAdjustment, RefData, BusRouteStop } from '../types'
import { normalizeStop, findFuzzyMatch } from './normalizeStop'

// ─── Public holidays (Singapore) ────────────────────────────────────────────

/**
 * Singapore public holidays in ISO date format.
 * Update annually. Source: MOM / MTI.
 */
const PUBLIC_HOLIDAYS = new Set([
  // 2024
  '2024-01-01', '2024-02-10', '2024-02-11', '2024-04-10', '2024-05-01',
  '2024-05-23', '2024-06-17', '2024-08-09', '2024-10-31', '2024-12-25',
  // 2025
  '2025-01-01', '2025-01-29', '2025-01-30', '2025-04-18', '2025-05-01',
  '2025-05-12', '2025-06-07', '2025-08-09', '2025-10-20', '2025-12-25',
  // 2026
  '2026-01-01', '2026-02-17', '2026-02-18', '2026-04-03', '2026-05-01',
  '2026-05-31', '2026-06-26', '2026-08-10', '2026-11-08', '2026-12-25',
])

// ─── Card type → fare column ─────────────────────────────────────────────────

type FareColumn = 'adultCents' | 'seniorCents' | 'studentCents' | 'workfareCents' | 'pwdCents'

function getFareColumn(cardType: string): FareColumn {
  const ct = cardType.toUpperCase()
  if (ct.includes('SENIOR')) return 'seniorCents'
  if (ct.includes('STUDENT')) return 'studentCents'
  if (ct.includes('WORKFARE')) return 'workfareCents'
  if (ct.includes('PWD')) return 'pwdCents'
  // MONEY SAVER and any unknown type → adult fare
  return 'adultCents'
}

// ─── Distance resolution ─────────────────────────────────────────────────────

/**
 * Find all bus stop codes matching a Description, with fuzzy fallback.
 * Multiple stops can share the same description (e.g. "Blk 708" exists in
 * different estates), so we return all candidates and let the caller pick
 * the one that actually appears on the relevant route.
 */
function resolveBusStopCodes(
  rawName: string,
  refData: RefData
): { codes: string[]; fuzzyLabel?: string } | null {
  const normalised = normalizeStop(rawName, { stripExits: false })

  // Build lookup: normalised description → all codes with that description
  const descToCodes: Record<string, string[]> = {}
  for (const stop of Object.values(refData.busStops)) {
    if (typeof stop !== 'object' || stop === null || !stop.Description) continue
    const key = normalizeStop(stop.Description, { stripExits: false })
    if (!descToCodes[key]) descToCodes[key] = []
    descToCodes[key]!.push(stop.BusStopCode)
  }

  // Exact match
  if (descToCodes[normalised]) {
    return { codes: descToCodes[normalised]! }
  }

  // Fuzzy match
  const candidates = Object.keys(descToCodes)
  const fuzzy = findFuzzyMatch(normalised, candidates)
  if (fuzzy) {
    return {
      codes: descToCodes[fuzzy.match]!,
      fuzzyLabel: `Low-confidence stop match: "${rawName}" → "${fuzzy.match}"`,
    }
  }

  return null
}

/**
 * Compute distance (km) for a bus leg.
 *
 * Algorithm:
 * 1. Resolve board stop and alight stop to BusStopCode
 * 2. Search bus route (all directions) for both stop codes
 * 3. Take abs(alight.distanceFromStart - board.distanceFromStart)
 */
function computeBusLegDistance(
  leg: Leg,
  refData: RefData
): { distanceKm: number; adjustments: FareAdjustment[] } | { error: string } {
  if (!leg.busService) return { error: 'No bus service number on bus leg' }

  const adjustments: FareAdjustment[] = []

  const boardResult = resolveBusStopCodes(leg.fromStop, refData)
  if (!boardResult) return { error: `Unknown stop: ${leg.fromStop}` }
  if (boardResult.fuzzyLabel) {
    adjustments.push({ label: boardResult.fuzzyLabel, deltaCents: 0 })
  }

  const alightResult = resolveBusStopCodes(leg.toStop, refData)
  if (!alightResult) return { error: `Unknown stop: ${leg.toStop}` }
  if (alightResult.fuzzyLabel) {
    adjustments.push({ label: alightResult.fuzzyLabel, deltaCents: 0 })
  }

  const routes = refData.busRoutes[leg.busService]
  if (!routes) return { error: `Unknown bus service: ${leg.busService}` }

  // Search all directions and all code combinations — stops with duplicate
  // descriptions (e.g. "Blk 708") need route membership to disambiguate
  for (const dirStops of Object.values(routes)) {
    const stops = dirStops as BusRouteStop[]
    for (const boardCode of boardResult.codes) {
      const boardStop = stops.find(s => s.BusStopCode === boardCode)
      if (!boardStop) continue
      for (const alightCode of alightResult.codes) {
        const alightStop = stops.find(s => s.BusStopCode === alightCode)
        if (alightStop && alightStop.StopSequence > boardStop.StopSequence) {
          const distanceKm = alightStop.Distance - boardStop.Distance
          return { distanceKm, adjustments }
        }
      }
    }
  }

  return { error: `Route ${leg.busService} does not connect ${leg.fromStop} → ${leg.toStop}` }
}

// ─── Per-line distance lookup helpers ────────────────────────────────────────

type StationInLine = { lineCode: string; cumKm: number; matchedKey: string }

/**
 * Find all (line, cumKm) entries for a normalised station name.
 * Returns one entry per line the station appears on.
 */
function findStationInLines(
  norm: string,
  lines: Record<string, Record<string, number>>
): StationInLine[] {
  const results: StationInLine[] = []
  for (const [lineCode, lineDists] of Object.entries(lines)) {
    if (norm in lineDists) {
      results.push({ lineCode, cumKm: lineDists[norm]!, matchedKey: norm })
    }
  }
  return results
}

/**
 * Fuzzy-match a station name against all stations across all lines.
 * Returns updated entries with the matched key substituted.
 */
function fuzzyFindInLines(
  norm: string,
  lines: Record<string, Record<string, number>>
): { entries: StationInLine[]; matchedKey: string } | null {
  // Build a deduplicated set of all normalised names
  const allKeys = [...new Set(Object.values(lines).flatMap(l => Object.keys(l)))]
  const fuzzy = findFuzzyMatch(norm, allKeys)
  if (!fuzzy) return null

  const entries = findStationInLines(fuzzy.match, lines)
  return { entries, matchedKey: fuzzy.match }
}

/**
 * Minimum network distance from fromEntries to toEntries.
 *
 * Algorithm:
 *   1. Same line: |cum[from] - cum[to]|
 *   2. One interchange: for each pair (fromLine, toLine), find all stations
 *      that appear in BOTH lines — these are interchange points.
 *      distance = |cum_fromLine[from] - cum_fromLine[ix]|
 *               + |cum_toLine[ix] - cum_toLine[to]|
 *
 * Branch lines (EWL_CG, CCL_CE) share their junction station with the parent
 * line (e.g. tanah merah in both EWL and EWL_CG), so one-interchange routing
 * correctly handles journeys that cross a branch junction.
 */
function minNetworkDistance(
  fromEntries: StationInLine[],
  toEntries: StationInLine[],
  lines: Record<string, Record<string, number>>
): number {
  let best = Infinity

  for (const from of fromEntries) {
    const fromLineDists = lines[from.lineCode]!

    for (const to of toEntries) {
      if (from.lineCode === to.lineCode) {
        // Direct same-line distance
        best = Math.min(best, Math.abs(from.cumKm - to.cumKm))
      } else {
        // One interchange: find all stations shared between from-line and to-line
        const toLineDists = lines[to.lineCode]!
        for (const [ixNorm, fromLineCum] of Object.entries(fromLineDists)) {
          const toLineCum = toLineDists[ixNorm]
          if (toLineCum !== undefined) {
            const dist = Math.abs(from.cumKm - fromLineCum) + Math.abs(toLineCum - to.cumKm)
            best = Math.min(best, dist)
          }
        }

        // Two interchanges: from → ix1 (fromLine ↔ midLine) → ix2 (midLine ↔ toLine) → to
        // Handles cases like NSL → EWL (at Jurong East) → EWL_CG (at Tanah Merah)
        for (const [midLineCode, midLineDists] of Object.entries(lines)) {
          if (midLineCode === from.lineCode || midLineCode === to.lineCode) continue
          for (const [ix1Norm, fromCum1] of Object.entries(fromLineDists)) {
            const midCum1 = midLineDists[ix1Norm]
            if (midCum1 === undefined) continue
            for (const [ix2Norm, midCum2] of Object.entries(midLineDists)) {
              const toCum2 = toLineDists[ix2Norm]
              if (toCum2 === undefined) continue
              const dist = Math.abs(from.cumKm - fromCum1)
                         + Math.abs(midCum1 - midCum2)
                         + Math.abs(toCum2 - to.cumKm)
              best = Math.min(best, dist)
            }
          }
        }
      }
    }
  }

  return best
}

/**
 * Compute distance (km) for a train leg using per-line cumulative distances.
 */
function computeTrainLegDistance(
  leg: Leg,
  refData: RefData
): { distanceKm: number; adjustments: FareAdjustment[] } | { error: string } {
  const adjustments: FareAdjustment[] = []
  const { lines } = refData.mrtDistances

  const fromNorm = normalizeStop(leg.fromStop)
  const toNorm = normalizeStop(leg.toStop)

  // Exact lookup
  let fromEntries = findStationInLines(fromNorm, lines)
  let toEntries = findStationInLines(toNorm, lines)

  // Fuzzy fallback for unrecognised names
  if (fromEntries.length === 0) {
    const fuzzy = fuzzyFindInLines(fromNorm, lines)
    if (!fuzzy) return { error: `Unknown stop: ${leg.fromStop}` }
    adjustments.push({
      label: `Low-confidence stop match: "${leg.fromStop}" -> "${fuzzy.matchedKey}"`,
      deltaCents: 0,
    })
    fromEntries = fuzzy.entries
  }

  if (toEntries.length === 0) {
    const fuzzy = fuzzyFindInLines(toNorm, lines)
    if (!fuzzy) return { error: `Unknown stop: ${leg.toStop}` }
    adjustments.push({
      label: `Low-confidence stop match: "${leg.toStop}" -> "${fuzzy.matchedKey}"`,
      deltaCents: 0,
    })
    toEntries = fuzzy.entries
  }

  const distanceKm = minNetworkDistance(fromEntries, toEntries, lines)

  if (!isFinite(distanceKm)) {
    return { error: `No route found: ${leg.fromStop} -> ${leg.toStop}` }
  }

  return { distanceKm, adjustments }
}

// ─── Fare lookup ──────────────────────────────────────────────────────────────

/**
 * Look up the fare for a given total distance and card type.
 * Returns null if the distance is outside all fare bands.
 */
function lookupFare(distanceKm: number, fareColumn: FareColumn, refData: RefData): number | null {
  for (const band of refData.fareTable.bands) {
    if (distanceKm >= band.minKm && distanceKm <= band.maxKm) {
      return band[fareColumn]
    }
  }
  return null
}

// ─── Pre-peak discount ────────────────────────────────────────────────────────

/**
 * Returns true if the pre-peak discount applies:
 * - First leg is train
 * - Tap-in time is before 07:45
 * - Journey is on a weekday (Mon–Fri)
 * - Not a public holiday
 */
function isPrePeak(firstLeg: Leg): boolean {
  if (firstLeg.mode !== 'train') return false

  const ts = new Date(firstLeg.timestamp)
  const dayOfWeek = ts.getDay() // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return false

  const isoDate = firstLeg.timestamp.slice(0, 10)
  if (PUBLIC_HOLIDAYS.has(isoDate)) return false

  const hours = ts.getHours()
  const minutes = ts.getMinutes()
  const totalMinutes = hours * 60 + minutes
  const prePeakCutoff = 7 * 60 + 45 // 07:45

  return totalMinutes < prePeakCutoff
}

// ─── Main fare computation ────────────────────────────────────────────────────

/**
 * Compute the estimated adult fare (in cents) for a journey.
 *
 * @param journey - Parsed journey from the SimplyGo statement
 * @param cardType - Card type string from the Statement (e.g. "MONEY SAVER")
 * @param refData - Reference data (fare table, bus stops, bus routes, MRT distances, express services)
 * @returns FareResult with fare in cents, adjustments, and optional reason string if unresolvable
 */
export function computeFare(journey: Journey, cardType: string, refData: RefData): FareResult {
  const adjustments: FareAdjustment[] = []

  if (journey.legs.length === 0) {
    return { fare: null, reason: 'Journey has no legs', adjustments: [] }
  }

  // Resolve distances for all legs
  let totalDistanceKm = 0

  for (const leg of journey.legs) {
    if (leg.mode === 'bus') {
      const result = computeBusLegDistance(leg, refData)
      if ('error' in result) {
        return { fare: null, reason: result.error, adjustments }
      }
      totalDistanceKm += result.distanceKm
      adjustments.push(...result.adjustments)
    } else {
      const result = computeTrainLegDistance(leg, refData)
      if ('error' in result) {
        return { fare: null, reason: result.error, adjustments }
      }
      totalDistanceKm += result.distanceKm
      adjustments.push(...result.adjustments)
    }
  }

  // Round to 1 decimal place to match LTA's distance bands
  totalDistanceKm = Math.round(totalDistanceKm * 10) / 10

  // Look up fare for this card type
  const fareColumn = getFareColumn(cardType)
  const baseFare = lookupFare(totalDistanceKm, fareColumn, refData)

  if (baseFare === null) {
    return {
      fare: null,
      reason: `Distance ${totalDistanceKm.toFixed(1)} km is outside fare table range`,
      adjustments,
    }
  }

  let fare = baseFare

  // Apply pre-peak discount (−$0.50 = −50 cents)
  const firstLeg = journey.legs[0]!
  if (isPrePeak(firstLeg)) {
    adjustments.push({ label: 'Pre-peak discount', deltaCents: -50 })
    fare -= 50
  }

  // Apply express bus surcharge (+$0.40 = +40 cents) for any leg
  for (const leg of journey.legs) {
    if (leg.mode === 'bus' && leg.busService) {
      if (refData.expressServices.includes(leg.busService)) {
        adjustments.push({
          label: `Express bus surcharge (service ${leg.busService})`,
          deltaCents: 40,
        })
        fare += 40
        break // Surcharge is per journey, not per leg
      }
    }
  }

  // Ensure fare cannot go negative
  fare = Math.max(fare, 0)

  return { fare, adjustments }
}

/**
 * Format a fare value in cents as a dollar string, e.g. 119 → "$1.19"
 */
export function formatFare(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * Compute the savings for a single journey:
 * adultFare - actualCharged (in cents)
 * Both inputs should be in cents.
 */
export function computeJourneySavings(adultFareCents: number, chargedCents: number): number {
  return adultFareCents - chargedCents
}
