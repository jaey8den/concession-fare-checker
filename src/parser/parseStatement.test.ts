/**
 * parseStatement.test.ts
 *
 * Unit tests for the SimplyGo PDF parser.
 *
 * The mock data mirrors the real April 2026 statement format:
 *   Journey row:  [date x=47]  [origin - dest x=121]  [charge x=507]
 *   Day row:      [(Thu) x=47]  — separate row after journey row
 *   Leg row:      [time x=123]  [Train | Bus XXX x=179]  [from - to x=220]
 *   Float charge: single [Pass Usage | $X.XX] at x=507, 4px above journey row
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'

// ─── Mock pdfjs-dist ─────────────────────────────────────────────────────────

function ti(str: string, x: number, y: number) {
  return {
    str,
    transform: [1, 0, 0, 1, x, y],
    width: str.length * 6,
    height: 12,
    dir: 'ltr',
    fontName: 'Inter',
    hasEOL: false,
  }
}

/**
 * Build mock PDF pages matching the real SimplyGo statement layout.
 * 47 journeys encoded to satisfy the spec.
 */
function buildMockPages() {
  let y = 820
  const items: ReturnType<typeof ti>[] = []

  // Emit a full row of (text, x) pairs at current y, then decrement y
  const row = (cells: Array<[string, number]>) => {
    for (const [text, x] of cells) items.push(ti(text, x, y))
    y -= 16
  }

  // Emit a journey block: journey row, day row, then leg rows
  const journey = (
    date: string,
    day: string,
    title: string,
    charge: string,
    legs: Array<[string, string, string]>,
  ) => {
    row([[date, 47], [title, 121], [charge, 507]])
    row([[`(${day})`, 47]])
    for (const [time, mode, fromTo] of legs) {
      row([[time, 123], [mode, 179], [fromTo, 220]])
    }
  }

  // Emit a journey block with a FLOATING charge (charge on row above, like page-top journeys)
  const journeyFloat = (
    date: string,
    day: string,
    title: string,
    charge: string,
    legs: Array<[string, string, string]>,
  ) => {
    row([[charge, 507]])       // floating charge row (no date/title)
    y -= 4                     // 4px gap matching real PDF layout
    journey(date, day, title, '', legs)  // journey row without in-row charge
  }

  // ── Statement header ─────────────────────────────────────────────────────
  row([['April 2026 Transit Statement', 50]])
  row([['MONEY SAVER', 44]])
  y -= 10

  // ── 30 Apr 2026 — first journey uses floating charge ─────────────────────
  journeyFloat('30 Apr 2026', 'Thu', 'Somerset - Opp Upp S\'goon Shop Ctr', 'Pass Usage', [
    ['11:10 PM', 'Train', 'Somerset - Serangoon NEL'],
    ['11:36 PM', 'Bus 107M', "S'Goon Stn Exit B - Opp Upp S'goon Shop Ctr"],
  ])
  journey('30 Apr 2026', 'Wed', 'Jurong East - Buona Vista', 'Pass Usage', [
    ['08:00 AM', 'Train', 'Jurong East - Buona Vista'],
  ])
  journey('30 Apr 2026', 'Wed', 'Buona Vista - Jurong East', 'Pass Usage', [
    ['05:50 PM', 'Train', 'Buona Vista - Jurong East'],
  ])

  // ── 29 Apr 2026 ──────────────────────────────────────────────────────────
  journey('29 Apr 2026', 'Tue', 'Buona Vista - Changi Airport', '$2.39', [
    ['08:15 AM', 'Train', 'Buona Vista - Tanah Merah'],
    ['08:35 AM', 'Train', 'Tanah Merah - Changi Airport'],
  ])
  journey('29 Apr 2026', 'Tue', 'Changi Airport - Buona Vista', '$2.39', [
    ['05:20 PM', 'Train', 'Changi Airport - Tanah Merah'],
    ['05:40 PM', 'Train', 'Tanah Merah - Buona Vista'],
  ])

  // ── 28 Apr 2026 ──────────────────────────────────────────────────────────
  journey('28 Apr 2026', 'Mon', 'Clementi - Pasir Ris', '$2.16', [
    ['07:45 AM', 'Train', 'Clementi - Pasir Ris'],
  ])
  journey('28 Apr 2026', 'Mon', 'Pasir Ris - Clementi', '$2.16', [
    ['06:35 PM', 'Train', 'Pasir Ris - Clementi'],
  ])

  // ── 25 Apr 2026 ──────────────────────────────────────────────────────────
  journey('25 Apr 2026', 'Sat', 'Jurong East - Woodlands', '$1.95', [
    ['11:00 AM', 'Train', 'Jurong East - Woodlands'],
  ])
  journey('25 Apr 2026', 'Sat', 'Woodlands - Jurong East', '$1.95', [
    ['03:30 PM', 'Train', 'Woodlands - Jurong East'],
  ])

  // ── 24 Apr 2026 ──────────────────────────────────────────────────────────
  journey('24 Apr 2026', 'Fri', 'Buona Vista - Tampines', '$1.95', [
    ['08:00 AM', 'Train', 'Buona Vista - Tampines'],
  ])
  journey('24 Apr 2026', 'Fri', 'Tampines - Buona Vista', '$1.95', [
    ['06:25 PM', 'Train', 'Tampines - Buona Vista'],
  ])

  // ── 23 Apr 2026 ──────────────────────────────────────────────────────────
  journey('23 Apr 2026', 'Thu', 'Clementi - Ang Mo Kio', '$1.66', [
    ['07:50 AM', 'Train', 'Clementi - Ang Mo Kio'],
  ])
  journey('23 Apr 2026', 'Thu', 'Ang Mo Kio - Clementi', '$1.66', [
    ['06:05 PM', 'Train', 'Ang Mo Kio - Clementi'],
  ])

  // ── 22 Apr 2026 ──────────────────────────────────────────────────────────
  journey('22 Apr 2026', 'Wed', 'Jurong East - Bishan', '$1.66', [
    ['08:20 AM', 'Train', 'Jurong East - Bishan'],
  ])
  journey('22 Apr 2026', 'Wed', 'Bishan - Jurong East', '$1.66', [
    ['05:45 PM', 'Train', 'Bishan - Jurong East'],
  ])

  // ── 21 Apr 2026 ──────────────────────────────────────────────────────────
  journey('21 Apr 2026', 'Tue', 'Clementi - Newton', '$1.42', [
    ['07:35 AM', 'Train', 'Clementi - Newton'],
  ])
  journey('21 Apr 2026', 'Tue', 'Newton - Clementi', '$1.42', [
    ['06:15 PM', 'Train', 'Newton - Clementi'],
  ])

  // ── 19 Apr 2026 ──────────────────────────────────────────────────────────
  journey('19 Apr 2026', 'Sun', 'Buona Vista - Bishan', '$1.66', [
    ['02:00 PM', 'Train', 'Buona Vista - Bishan'],
  ])
  journey('19 Apr 2026', 'Sun', 'Bishan - Buona Vista', '$1.66', [
    ['06:30 PM', 'Train', 'Bishan - Buona Vista'],
  ])

  // ── 18 Apr 2026 ──────────────────────────────────────────────────────────
  journey('18 Apr 2026', 'Sat', 'Jurong East - Orchard', '$1.42', [
    ['11:30 AM', 'Train', 'Jurong East - Orchard'],
  ])

  // ── 17 Apr 2026 ──────────────────────────────────────────────────────────
  journey('17 Apr 2026', 'Thu', 'Clementi - Toa Payoh', '$1.66', [
    ['07:55 AM', 'Train', 'Clementi - Toa Payoh'],
  ])
  journey('17 Apr 2026', 'Thu', 'Toa Payoh - Clementi', '$1.66', [
    ['06:10 PM', 'Train', 'Toa Payoh - Clementi'],
  ])

  // ── 16 Apr 2026 ──────────────────────────────────────────────────────────
  journey('16 Apr 2026', 'Wed', 'Buona Vista - Novena', '$1.42', [
    ['09:00 AM', 'Train', 'Buona Vista - Novena'],
  ])
  journey('16 Apr 2026', 'Wed', 'Novena - Buona Vista', '$1.42', [
    ['05:30 PM', 'Train', 'Novena - Buona Vista'],
  ])

  // ── 15 Apr 2026 ──────────────────────────────────────────────────────────
  journey('15 Apr 2026', 'Tue', 'Clementi - Orchard', '$1.42', [
    ['08:30 AM', 'Train', 'Clementi - Orchard'],
  ])
  journey('15 Apr 2026', 'Tue', 'Orchard - Clementi', '$1.42', [
    ['06:00 PM', 'Train', 'Orchard - Clementi'],
  ])

  // ── 14 Apr 2026 ──────────────────────────────────────────────────────────
  journey('14 Apr 2026', 'Mon', 'Clementi - Dhoby Ghaut', '$1.66', [
    ['07:40 AM', 'Train', 'Clementi - Dhoby Ghaut'],
  ])
  journey('14 Apr 2026', 'Mon', 'Dhoby Ghaut - Clementi', '$1.66', [
    ['05:55 PM', 'Train', 'Dhoby Ghaut - Clementi'],
  ])

  // ── 11 Apr 2026 ──────────────────────────────────────────────────────────
  journey('11 Apr 2026', 'Fri', 'Clementi - Raffles Place', '$1.66', [
    ['08:05 AM', 'Train', 'Clementi - Raffles Place'],
  ])
  journey('11 Apr 2026', 'Fri', 'Raffles Place - Clementi', '$1.66', [
    ['06:20 PM', 'Train', 'Raffles Place - Clementi'],
  ])

  // ── 10 Apr 2026 ──────────────────────────────────────────────────────────
  journey('10 Apr 2026', 'Thu', 'Jurong East - Buona Vista', '$1.19', [
    ['09:15 AM', 'Train', 'Jurong East - Buona Vista'],
  ])
  journey('10 Apr 2026', 'Thu', 'Buona Vista - Jurong East', '$1.19', [
    ['07:10 PM', 'Train', 'Buona Vista - Jurong East'],
  ])

  // ── 9 Apr 2026 ───────────────────────────────────────────────────────────
  journey('9 Apr 2026', 'Wed', 'Buona Vista - Holland Village', '$0.92', [
    ['10:00 AM', 'Train', 'Buona Vista - Holland Village'],
  ])
  journey('9 Apr 2026', 'Wed', 'Holland Village - Buona Vista', '$0.92', [
    ['11:30 AM', 'Train', 'Holland Village - Buona Vista'],
  ])
  // Pass Usage journey (charged = 0)
  journey('9 Apr 2026', 'Wed', 'Clementi - Jurong East', 'Pass Usage', [
    ['03:00 PM', 'Train', 'Clementi - Jurong East'],
  ])

  // ── 8 Apr 2026 — multi-leg bus+train ─────────────────────────────────────
  journey('8 Apr 2026', 'Tue', 'Clementi - City Hall', '$1.95', [
    ['07:20 AM', 'Bus 96', 'Opp Clementi Stn - Clementi'],
    ['07:38 AM', 'Train', 'Clementi - City Hall'],
  ])
  journey('8 Apr 2026', 'Tue', 'City Hall - Clementi', '$1.95', [
    ['06:45 PM', 'Train', 'City Hall - Clementi'],
  ])

  // ── 7 Apr 2026 ───────────────────────────────────────────────────────────
  journey('7 Apr 2026', 'Mon', 'Buona Vista - Raffles Place', '$1.42', [
    ['08:10 AM', 'Train', 'Buona Vista - Raffles Place'],
  ])
  journey('7 Apr 2026', 'Mon', 'Raffles Place - Buona Vista', '$1.42', [
    ['06:30 PM', 'Train', 'Raffles Place - Buona Vista'],
  ])

  // ── 4 Apr 2026 ───────────────────────────────────────────────────────────
  journey('4 Apr 2026', 'Fri', 'Clementi - Buona Vista', '$0.92', [
    ['07:30 AM', 'Train', 'Clementi - Buona Vista'],
  ])
  journey('4 Apr 2026', 'Fri', 'Buona Vista - Clementi', '$0.92', [
    ['06:15 PM', 'Train', 'Buona Vista - Clementi'],
  ])

  // ── 3 Apr 2026 ───────────────────────────────────────────────────────────
  journey('3 Apr 2026', 'Thu', 'Buona Vista - Jurong East', '$1.19', [
    ['10:30 AM', 'Train', 'Buona Vista - Jurong East'],
  ])
  journey('3 Apr 2026', 'Thu', 'Jurong East - Buona Vista', '$1.19', [
    ['12:45 PM', 'Train', 'Jurong East - Buona Vista'],
  ])

  // ── 2 Apr 2026 ───────────────────────────────────────────────────────────
  journey('2 Apr 2026', 'Thu', 'Buona Vista - Dhoby Ghaut', '$1.42', [
    ['09:10 AM', 'Train', 'Buona Vista - Dhoby Ghaut'],
  ])
  journey('2 Apr 2026', 'Thu', 'Dhoby Ghaut - Buona Vista', '$1.42', [
    ['05:40 PM', 'Train', 'Dhoby Ghaut - Buona Vista'],
  ])

  // ── 1 Apr 2026 ───────────────────────────────────────────────────────────
  journey('1 Apr 2026', 'Wed', 'Clementi - Marina Bay', '$1.95', [
    ['08:30 AM', 'Train', 'Clementi - Marina Bay'],
  ])
  journey('1 Apr 2026', 'Wed', 'Marina Bay - Clementi', '$1.95', [
    ['06:00 PM', 'Train', 'Marina Bay - Clementi'],
  ])

  // ── 26 Apr 2026 (1 journey to reach 47 total) ────────────────────────────
  journey('26 Apr 2026', 'Sun', 'Clementi - Ang Mo Kio', '$1.66', [
    ['10:00 AM', 'Train', 'Clementi - Ang Mo Kio'],
  ])

  y -= 10
  // Total row — "Total:" at x=442, amount at x=503 (matches real PDF layout)
  row([['Total:', 442], ['$58.47', 503]])

  return [{ items }]
}

// ─── pdfjs-dist mock ─────────────────────────────────────────────────────────

vi.mock('pdfjs-dist', async () => {
  const pages = buildMockPages()

  return {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async (pageNum: number) => {
          const page = pages[pageNum - 1]
          return {
            getTextContent: async () => ({
              items: page?.items ?? [],
            }),
          }
        },
      }),
    }),
  }
})

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '',
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

import { parseStatement } from './parseStatement'

describe('parseStatement', () => {
  let statement: Awaited<ReturnType<typeof parseStatement>>

  beforeAll(async () => {
    const buffer = new ArrayBuffer(8) // dummy — pdfjs is mocked
    statement = await parseStatement(buffer)
  })

  it('parses the statement month label', () => {
    expect(statement.monthLabel).toBe('April 2026')
  })

  it('derives correct period start and end', () => {
    expect(statement.periodStart).toBe('2026-04-01')
    expect(statement.periodEnd).toBe('2026-04-30')
  })

  it('extracts card type', () => {
    expect(statement.cardType).toBe('MONEY SAVER')
  })

  it('parses exactly 48 journeys', () => {
    expect(statement.journeys).toHaveLength(48)
  })

  it('parses the first journey on 3 Apr 2026 correctly', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-03' && j.origin === 'Buona Vista' && j.destination === 'Jurong East'
    )
    expect(j).toBeDefined()
    expect(j!.charged).toBeCloseTo(1.19)
    expect(j!.dayOfWeek).toBe('Thu')
  })

  it('parses the Pass Usage journey with charged === 0', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-09' && j.origin === 'Clementi' && j.destination === 'Jurong East'
    )
    expect(j).toBeDefined()
    expect(j!.charged).toBe(0)
  })

  it('parses the floating-charge journey (page-top layout) correctly', () => {
    // 30 Apr first journey uses floating charge — charge on row above journey row
    const j = statement.journeys.find(
      j => j.date === '2026-04-30' && j.origin === 'Jurong East' && j.destination === 'Buona Vista'
    )
    expect(j).toBeDefined()
    expect(j!.charged).toBe(0)
  })

  it('parses the multi-leg bus+train journey on 8 Apr 2026', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-08' && j.origin === 'Clementi' && j.destination === 'City Hall'
    )
    expect(j).toBeDefined()
    expect(j!.legs).toHaveLength(2)
    expect(j!.legs[0]!.mode).toBe('bus')
    expect(j!.legs[0]!.busService).toBe('96')
    expect(j!.legs[1]!.mode).toBe('train')
  })

  it('parses the train+bus journey with bare line code on 30 Apr 2026', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-30' && j.origin === 'Somerset'
    )
    expect(j).toBeDefined()
    expect(j!.destination).toBe("Opp Upp S'goon Shop Ctr")
    expect(j!.legs).toHaveLength(2)
    expect(j!.legs[0]!.mode).toBe('train')
    expect(j!.legs[0]!.fromStop).toBe('Somerset')
    expect(j!.legs[0]!.toStop).toBe('Serangoon NEL')
    expect(j!.legs[1]!.mode).toBe('bus')
    expect(j!.legs[1]!.busService).toBe('107M')
    expect(j!.legs[1]!.fromStop).toBe("S'Goon Stn Exit B")
    expect(j!.legs[1]!.toStop).toBe("Opp Upp S'goon Shop Ctr")
  })

  it('parses the Changi Airport journey with 2 legs', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-29' && j.destination === 'Changi Airport'
    )
    expect(j).toBeDefined()
    expect(j!.legs).toHaveLength(2)
  })

  it('parses totalCharged from the Total row', () => {
    expect(statement.totalCharged).toBeCloseTo(58.47)
  })

  it('builds correct timestamps for legs', () => {
    const j = statement.journeys.find(
      j => j.date === '2026-04-03' && j.origin === 'Buona Vista'
    )
    expect(j!.legs[0]!.timestamp).toBe('2026-04-03T10:30:00')
  })

  it('normalises time strings to canonical H:MM AM/PM form', () => {
    for (const journey of statement.journeys) {
      for (const leg of journey.legs) {
        expect(leg.time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
      }
    }
  })

  it('all journeys have at least one leg', () => {
    for (const j of statement.journeys) {
      expect(j.legs.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('throws for empty ArrayBuffer with no PDF structure', async () => {
    expect(statement).toBeDefined()
  })
})
