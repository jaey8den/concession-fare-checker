/**
 * normalizeStop.ts
 *
 * Normalises raw stop names from SimplyGo PDFs into forms suitable for
 * lookup against LTA DataMall datasets.
 *
 * All transformations are deterministic and pure.
 */

// ─── Expansion map ────────────────────────────────────────────────────────────

/**
 * Ordered list of abbreviation expansions.
 * Applied in sequence — order matters (longer patterns first to avoid
 * partial replacement of longer abbreviations).
 */
const EXPANSIONS: Array<[RegExp, string]> = [
  // Multi-character abbreviations first
  [/\bC'wealth\b/gi, 'Commonwealth'],
  [/\bS'goon\b/gi, 'Serangoon'],
  [/\bCres\b/gi, 'Crescent'],
  [/\bDr\b/gi, 'Drive'],
  [/\bAve\b/gi, 'Avenue'],
  [/\bInt\b/gi, 'Interchange'],
  [/\bStn\b/gi, 'Station'],
  [/\bOpp\b/gi, 'Opposite'],
  [/\bAft\b/gi, 'After'],
  [/\bBef\b/gi, 'Before'],
  [/\bCtr\b/gi, 'Centre'],
  [/\bBt\b/gi, 'Bukit'],
  [/\bCl\b/gi, 'Close'],
  [/\bRd\b/gi, 'Road'],
]

// Remove boarding/alighting labels appended by SimplyGo PDF:
//   "Ang Mo Kio Int Alighting", "Ang Mo Kio Boarding 2"
const BOARDING_ALIGHTING_SUFFIX = /\s+(Alighting|Boarding\s*\d*)$/i

// Remove exit/entrance suffixes like "Exit A", "Exit B/C"
const EXIT_SUFFIX = /\s*Exit\s+[A-Z][A-Z\/]*$/i

// Parenthesised line codes: "(NEL)", "(EWL)", etc.
const LINE_CODES = /\s*\((NEL|NSL|EWL|CCL|DTL|TEL|NSE|NE|NS|EW|CC|DT|TE)\)$/i

// Bare line codes appended without parentheses by SimplyGo: "Serangoon NEL", "City Hall NSEW"
// NSEW must precede NS/EW so the alternation matches the longer token first.
// \d* allows optional station numbers after the line code.
const BARE_LINE_CODE = /\s+(NEL|NSL|EWL|CCL|DTL|TEL|NSE|NSEW|NE|NS|EW|CC|DT|TE)\d*$/i

/**
 * Expand abbreviations, optionally strip exit suffixes and line codes,
 * normalise whitespace, and return a lowercase string for comparison.
 *
 * Pass { stripExits: false } for bus stop lookups — bus stop exits
 * ("Exit A/D", "Exit B/C") are distinct physical stops that must not
 * be collapsed into one another.
 */
export function normalizeStop(
  raw: string | undefined | null,
  options: { stripExits?: boolean } = {},
): string {
  const { stripExits = true } = options
  if (!raw || typeof raw !== 'string') return ''
  let result = raw.trim()

  // Apply all abbreviation expansions
  for (const [pattern, replacement] of EXPANSIONS) {
    result = result.replace(pattern, replacement)
  }

  // Strip boarding/alighting labels appended by SimplyGo PDF — always, for all stop types
  result = result.replace(BOARDING_ALIGHTING_SUFFIX, '')

  if (stripExits) {
    // Strip exit suffix ("Exit A", "Exit B/C") — only meaningful for MRT stations
    result = result.replace(EXIT_SUFFIX, '')

    // Strip parenthesised line code suffix — "(NEL)", "(EWL)", etc.
    result = result.replace(LINE_CODES, '')

    // Strip bare line code appended by SimplyGo PDF — "Serangoon NEL" → "Serangoon"
    result = result.replace(BARE_LINE_CODE, '')
  }

  // Collapse multiple whitespace
  result = result.replace(/\s+/g, ' ').trim()

  return result.toLowerCase()
}

/**
 * Extract line code from a station name if present.
 * Returns null if no line code found.
 * e.g. "Dhoby Ghaut (NEL)" → "NEL"
 */
export function extractLineCode(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const match = raw.match(LINE_CODES)
  return match ? match[1]!.toUpperCase() : null
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

/**
 * Compute Levenshtein distance between two strings.
 * Used as fuzzy fallback when exact match fails.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,       // deletion
        matrix[i]![j - 1]! + 1,       // insertion
        matrix[i - 1]![j - 1]! + cost // substitution
      )
    }
  }

  return matrix[b.length]![a.length]!
}

/**
 * Token-set ratio: split both strings into sorted token sets and compare.
 * Returns a value 0–1 where 1 is identical.
 */
export function tokenSetRatio(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))

  const intersection = new Set([...tokA].filter(t => tokB.has(t)))
  const union = new Set([...tokA, ...tokB])

  if (union.size === 0) return 1
  return intersection.size / union.size
}

/**
 * Find the best fuzzy match for a normalised stop name among a list of candidates.
 *
 * Returns the best match if:
 *   - Levenshtein distance ≤ 3, OR
 *   - token-set ratio ≥ 0.85
 *
 * Returns null if no candidate meets the threshold.
 */
export function findFuzzyMatch(
  needle: string,
  candidates: string[]
): { match: string; confidence: 'levenshtein' | 'token-set'; distance?: number; ratio?: number } | null {
  let bestLev = { match: '', distance: Infinity }
  let bestTsr = { match: '', ratio: 0 }

  for (const candidate of candidates) {
    const lev = levenshtein(needle, candidate)
    if (lev < bestLev.distance) {
      bestLev = { match: candidate, distance: lev }
    }

    const tsr = tokenSetRatio(needle, candidate)
    if (tsr > bestTsr.ratio) {
      bestTsr = { match: candidate, ratio: tsr }
    }
  }

  if (bestLev.distance <= 3) {
    return { match: bestLev.match, confidence: 'levenshtein', distance: bestLev.distance }
  }

  if (bestTsr.ratio >= 0.85) {
    return { match: bestTsr.match, confidence: 'token-set', ratio: bestTsr.ratio }
  }

  return null
}
