/**
 * parseStatement.ts
 *
 * Pure in-browser PDF parser for SimplyGo Transit Statement PDFs.
 * Uses pdfjs-dist for text extraction. No side effects, no DOM access, no fetch.
 *
 * Privacy guarantee: pdfBytes never leave this function; no PII is logged.
 *
 * Real PDF column layout (from April 2026 sample):
 *   Journey row:  [date x≈47]  [origin - dest x≈121]  [charge x≈507, optional]
 *   Day row:      [(Thu) x≈47]  — separate row immediately below journey row
 *   Leg row:      [time x≈123]  [Train | Bus XXX x≈179]  [from - to x≈220]
 *   Float charge: single item [Pass Usage | $X.XX] at x>450, appears 4px above
 *                 the first journey row on each page (PDF layout artefact)
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { Statement, Journey, Leg } from '../types'

// Configure the PDF.js worker. Using new URL() with import.meta.url is the
// recommended Vite-safe pattern for loading workers without CDN requests.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// ─── Row grouping ────────────────────────────────────────────────────────────

interface TextItemWithPos {
  text: string
  x: number
  y: number
}

/**
 * Group text items into rows by Y coordinate (±2px tolerance).
 * Each row is sorted left-to-right by X.
 */
function groupIntoRows(items: TextItemWithPos[]): TextItemWithPos[][] {
  if (items.length === 0) return []

  const sorted = [...items].sort((a, b) => b.y - a.y)

  const rows: TextItemWithPos[][] = []
  let currentRow: TextItemWithPos[] = [sorted[0]!]
  let currentY = sorted[0]!.y

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!
    if (Math.abs(item.y - currentY) <= 2) {
      currentRow.push(item)
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x))
      currentRow = [item]
      currentY = item.y
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x))

  return rows
}

// ─── Regex patterns ──────────────────────────────────────────────────────────

const RE_STATEMENT_TITLE = /^([A-Z][a-z]+ \d{4}) Transit Statement$/
const RE_DATE_ROW = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/
const RE_DAY_ROW = /^\(([A-Z][a-z]{2})\)$/
const RE_TIME = /^(\d{1,2}:\d{2})\s*(AM|PM)$/i
const RE_CHARGE = /\$\s*(\d+\.\d{2})/
const RE_TOTAL = /^Total[:\s]/i
const RE_BUS_SERVICE = /^Bus\s+(\S+)$/i
const RE_PERIOD = /([A-Z][a-z]+ \d{4}) Transit Statement/

const MONTH_MAP: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateLabel(day: string, month: string, year: string): string {
  const monthNames: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const mm = monthNames[month] ?? '01'
  const dd = day.padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function buildTimestamp(isoDate: string, time: string): string {
  const upper = time.toUpperCase().replace(/\s+/, '')
  const match = upper.match(/^(\d{1,2}):(\d{2})(AM|PM)$/)
  if (!match) return `${isoDate}T00:00:00`
  let hours = parseInt(match[1]!, 10)
  const minutes = parseInt(match[2]!, 10)
  const ampm = match[3]!
  if (ampm === 'AM') {
    if (hours === 12) hours = 0
  } else {
    if (hours !== 12) hours += 12
  }
  return `${isoDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

function normaliseTimeString(raw: string): string {
  const upper = raw.toUpperCase().replace(/\s+/, ' ').trim()
  const match = upper.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/)
  if (!match) return raw
  return `${match[1]} ${match[2]}`
}

function derivePeriod(monthLabel: string): { periodStart: string; periodEnd: string } {
  const parts = monthLabel.split(' ')
  const monthName = parts[0] ?? ''
  const year = parseInt(parts[1] ?? '2000', 10)
  const monthIdx = MONTH_MAP[monthName] ?? 0
  const start = new Date(year, monthIdx, 1)
  const end = new Date(year, monthIdx + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return { periodStart: fmt(start), periodEnd: fmt(end) }
}

// ─── Row classifiers ─────────────────────────────────────────────────────────

/**
 * Journey row: first cell is a date (e.g. "30 Apr 2026"), second cell is "Origin - Dest".
 * Optionally a third cell is the charge at x≈507.
 */
function isJourneyRow(row: TextItemWithPos[]): boolean {
  return row.length >= 2 && RE_DATE_ROW.test(row[0]!.text.trim())
}

/**
 * Floating charge row: a single item at x>450 that is "Pass Usage" or "$X.XX".
 * Appears 4px above the first journey row on each page due to PDF layout.
 */
function isFloatingCharge(row: TextItemWithPos[]): boolean {
  if (row.length !== 1) return false
  const text = row[0]!.text.trim()
  return row[0]!.x > 450 && (text === 'Pass Usage' || RE_CHARGE.test(text))
}

/**
 * Day-of-week row: single item at x<100 matching "(Thu)", "(Mon)", etc.
 * Always the row immediately after the journey row.
 */
function isDayRow(row: TextItemWithPos[]): boolean {
  return row.length >= 1 && RE_DAY_ROW.test(row[0]!.text.trim()) && row[0]!.x < 100
}

/**
 * Leg row: first cell is a time, must have at least 3 cells.
 * Format: [time]  [Train | Bus XXX]  [fromStop - toStop]
 */
function isLegRow(row: TextItemWithPos[]): boolean {
  return row.length >= 3 && RE_TIME.test(row[0]!.text.trim())
}

// ─── Leg parser ───────────────────────────────────────────────────────────────

/**
 * Parse a 3-column leg row into a Leg object.
 * Column 1: time ("11:10 PM")
 * Column 2: mode ("Train" | "Bus 107M")
 * Column 3+: "fromStop - toStop" as a single text item
 */
function parseLegRow(row: TextItemWithPos[], isoDate: string): Leg | null {
  if (row.length < 3) return null

  const timeRaw = row[0]!.text.trim()
  if (!RE_TIME.test(timeRaw)) return null

  const time = normaliseTimeString(timeRaw)
  const timestamp = buildTimestamp(isoDate, time)

  const serviceCol = row[1]!.text.trim()
  const busMatch = serviceCol.match(RE_BUS_SERVICE)
  const isTrain = /^(train|mrt|lrt)$/i.test(serviceCol)

  // From-to is in column 3 (and remainder) as "Origin - Destination"
  const fromToText = row.slice(2).map(r => r.text.trim()).filter(Boolean).join(' ')
  const sepIdx = fromToText.indexOf(' - ')
  if (sepIdx === -1) return null
  const fromStop = fromToText.slice(0, sepIdx).trim()
  const toStop = fromToText.slice(sepIdx + 3).trim()

  if (!fromStop || !toStop) return null

  if (isTrain) {
    return { time, timestamp, mode: 'train', fromStop, toStop }
  }
  return {
    time,
    timestamp,
    mode: 'bus',
    busService: busMatch ? busMatch[1]! : serviceCol,
    fromStop,
    toStop,
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a SimplyGo Transit Statement PDF into a structured Statement object.
 *
 * @param pdfBytes - ArrayBuffer of the PDF file (stays in-memory, never transmitted)
 * @returns Parsed Statement
 * @throws Error if the document is not a recognisable SimplyGo statement
 */
export async function parseStatement(pdfBytes: ArrayBuffer): Promise<Statement> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`,
    cMapUrl: `${import.meta.env.BASE_URL}cmaps/`,
    cMapPacked: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise
  const numPages = pdf.numPages

  const allRows: TextItemWithPos[][] = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    let content: Awaited<ReturnType<typeof page.getTextContent>>

    try {
      content = await page.getTextContent({ includeMarkedContent: false })
    } catch (pageErr) {
      console.error(`[FareCheck] getTextContent failed on page ${pageNum}:`, pageErr)
      throw pageErr
    }

    const items: TextItemWithPos[] = []
    for (const item of content.items) {
      const ti = item as TextItem
      if (!ti.str || typeof ti.str !== 'string' || ti.str.trim() === '') continue
      const transform = ti.transform
      if (!Array.isArray(transform) || transform.length < 6) continue
      items.push({
        text: ti.str,
        x: transform[4] as number,
        y: transform[5] as number,
      })
    }

    console.debug(`[FareCheck] page ${pageNum}: ${items.length} text items`)
    allRows.push(...groupIntoRows(items))
  }

  if (allRows.length === 0) {
    throw new Error('No text found in PDF. This does not appear to be a SimplyGo statement.')
  }

  // ── Extract statement metadata ──────────────────────────────────────────

  let monthLabel = ''
  let cardType = 'UNKNOWN'
  let totalCharged = 0

  for (const row of allRows) {
    const rowText = row.map(r => r.text).join(' ').trim()

    const titleMatch = rowText.match(RE_STATEMENT_TITLE)
    if (titleMatch && !monthLabel) {
      monthLabel = titleMatch[1]!
    }

    if (!monthLabel) {
      const periodMatch = rowText.match(RE_PERIOD)
      if (periodMatch) monthLabel = periodMatch[1]!
    }

    if (/MONEY SAVER|STUDENT|SENIOR CITIZEN|WORKFARE|PWD/i.test(rowText) &&
        cardType === 'UNKNOWN') {
      const ctMatch = rowText.match(/(MONEY SAVER|STUDENT|SENIOR CITIZEN|WORKFARE|PWD)/i)
      if (ctMatch) cardType = ctMatch[1]!.toUpperCase()
    }

    if (RE_TOTAL.test(rowText)) {
      const chargeMatch = rowText.match(RE_CHARGE)
      if (chargeMatch) totalCharged = parseFloat(chargeMatch[1]!)
    }
  }

  if (!monthLabel) {
    throw new Error(
      'Could not find statement month. This does not appear to be a SimplyGo Transit Statement.'
    )
  }

  const { periodStart, periodEnd } = derivePeriod(monthLabel)

  // ── Parse journeys ──────────────────────────────────────────────────────

  const journeys: Journey[] = []
  let currentDate = ''
  let currentDayOfWeek = ''
  let pendingCharged: number | null = null
  let i = 0

  while (i < allRows.length) {
    const row = allRows[i]!

    // Floating charge — save for the immediately following journey row
    if (isFloatingCharge(row)) {
      const text = row[0]!.text.trim()
      if (text === 'Pass Usage') {
        pendingCharged = 0
      } else {
        const m = text.match(RE_CHARGE)
        pendingCharged = m ? parseFloat(m[1]!) : 0
      }
      i++
      continue
    }

    // Journey row: [date]  [origin - destination]  [charge?]
    if (isJourneyRow(row)) {
      const dateMatch = row[0]!.text.trim().match(RE_DATE_ROW)!
      currentDate = parseDateLabel(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!)

      const lastCell = row[row.length - 1]!.text.trim()
      const hasInRowCharge =
        row.length >= 3 && (lastCell === 'Pass Usage' || RE_CHARGE.test(lastCell))

      let charged = 0
      if (hasInRowCharge) {
        if (lastCell === 'Pass Usage') {
          charged = 0
        } else {
          const m = lastCell.match(RE_CHARGE)
          charged = m ? parseFloat(m[1]!) : 0
        }
      } else if (pendingCharged !== null) {
        charged = pendingCharged
      }
      pendingCharged = null

      // Title text: items between date column and (optional) charge column
      const titleItems = row.slice(1, hasInRowCharge ? row.length - 1 : undefined)
      const titleText = titleItems.map(r => r.text.trim()).filter(Boolean).join(' ')
      const sepIdx = titleText.indexOf(' - ')
      const origin = sepIdx !== -1 ? titleText.slice(0, sepIdx).trim() : titleText
      let destination = sepIdx !== -1 ? titleText.slice(sepIdx + 3).trim() : ''

      // Non-concession trips append the fare to the destination text ("Bishan $1.23").
      // Extract it so charged is non-zero and the journey is not treated as pass usage.
      if (charged === 0) {
        const embeddedFare = destination.match(/\s*\$\s*(\d+\.\d{2})$/)
        if (embeddedFare) {
          charged = parseFloat(embeddedFare[1]!)
          destination = destination.slice(0, destination.length - embeddedFare[0].length).trim()
        }
      }

      i++

      // Day-of-week row immediately follows the journey row
      if (i < allRows.length && isDayRow(allRows[i]!)) {
        const dayMatch = allRows[i]![0]!.text.trim().match(RE_DAY_ROW)
        currentDayOfWeek = dayMatch ? dayMatch[1]! : ''
        i++
      }

      // Collect leg rows
      const legs: Leg[] = []
      while (i < allRows.length) {
        const next = allRows[i]!
        if (isLegRow(next)) {
          const leg = parseLegRow(next, currentDate)
          if (leg) legs.push(leg)
          i++
        } else if (isDayRow(next)) {
          // Orphaned day row (shouldn't occur in well-formed PDFs)
          i++
        } else {
          break
        }
      }

      if (origin) {
        journeys.push({
          date: currentDate,
          dayOfWeek: currentDayOfWeek,
          origin,
          destination,
          legs,
          charged,
        })
      }

      continue
    }

    i++
  }

  if (journeys.length === 0) {
    throw new Error(
      'No journeys found. This does not appear to be a valid SimplyGo Transit Statement.'
    )
  }

  return {
    monthLabel,
    periodStart,
    periodEnd,
    cardType,
    journeys,
    totalCharged,
  }
}
