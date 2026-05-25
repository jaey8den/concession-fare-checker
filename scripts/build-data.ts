/**
 * build-data.ts
 *
 * Refreshes the static reference data in public/data/ from LTA DataMall.
 *
 * Usage:
 *   npx tsx scripts/build-data.ts --key YOUR_LTA_API_KEY
 *
 * Without a key, the script validates the existing JSON files for
 * structural correctness and reports any issues.
 *
 * LTA DataMall API docs: https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf
 *
 * Required API endpoints:
 *   GET https://datamall2.mytransport.sg/ltaodataservice/BusStops
 *   GET https://datamall2.mytransport.sg/ltaodataservice/BusRoutes
 *
 * MRT distances are precomputed from published station-to-station distances
 * and stored as a symmetric adjacency matrix. The LTA DataMall does not
 * provide train journey distances directly.
 *
 * Fare table source: PTC fare schedules at https://www.ptc.gov.sg
 * Express service list: LTA bus operator route schedules
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'public', 'data')

const LTA_BASE_URL = 'https://datamall2.mytransport.sg/ltaodataservice'
const PAGE_SIZE = 500

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function getApiKey(): string | null {
  const args = process.argv.slice(2)
  const keyIdx = args.indexOf('--key')
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    return args[keyIdx + 1]!
  }
  return process.env['LTA_API_KEY'] ?? null
}

// ─── LTA DataMall fetcher ─────────────────────────────────────────────────────

async function fetchAllPages<T>(
  endpoint: string,
  apiKey: string
): Promise<T[]> {
  const results: T[] = []
  let skip = 0

  while (true) {
    const url = `${LTA_BASE_URL}/${endpoint}?$skip=${skip}`
    const response = await fetch(url, {
      headers: {
        AccountKey: apiKey,
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`LTA DataMall error: ${response.status} ${response.statusText} for ${endpoint}`)
    }

    const data = (await response.json()) as { value: T[] }
    const page = data.value

    if (!page || page.length === 0) break
    results.push(...page)

    if (page.length < PAGE_SIZE) break
    skip += PAGE_SIZE

    // Rate limiting: 1 req/s is safe
    await new Promise(r => setTimeout(r, 1100))
    process.stdout.write(`  Fetched ${results.length} records from ${endpoint}...\r`)
  }

  console.log(`  Fetched ${results.length} total records from ${endpoint}`)
  return results
}

// ─── Data builders ────────────────────────────────────────────────────────────

interface LTABusStop {
  BusStopCode: string
  RoadName: string
  Description: string
  Latitude: number
  Longitude: number
}

interface LTABusRoute {
  ServiceNo: string
  Operator: string
  Direction: number
  StopSequence: number
  BusStopCode: string
  Distance: number
}

async function buildBusStops(apiKey: string): Promise<void> {
  console.log('Fetching bus stops from LTA DataMall...')
  const stops = await fetchAllPages<LTABusStop>('BusStops', apiKey)

  // Index by BusStopCode for O(1) lookup
  const indexed: Record<string, LTABusStop> = {}
  for (const stop of stops) {
    indexed[stop.BusStopCode] = stop
  }

  writeFileSync(
    join(DATA_DIR, 'bus-stops.json'),
    JSON.stringify(indexed, null, 2),
    'utf8'
  )
  console.log(`  Wrote ${stops.length} bus stops to public/data/bus-stops.json`)
}

async function buildBusRoutes(apiKey: string): Promise<void> {
  console.log('Fetching bus routes from LTA DataMall...')
  const routes = await fetchAllPages<LTABusRoute>('BusRoutes', apiKey)

  // Index: ServiceNo → Direction → BusRouteStop[]
  const indexed: Record<string, Record<number, LTABusRoute[]>> = {}

  for (const route of routes) {
    if (!indexed[route.ServiceNo]) {
      indexed[route.ServiceNo] = {}
    }
    if (!indexed[route.ServiceNo]![route.Direction]) {
      indexed[route.ServiceNo]![route.Direction] = []
    }
    indexed[route.ServiceNo]![route.Direction]!.push(route)
  }

  // Sort stops by StopSequence within each direction
  for (const serviceRoutes of Object.values(indexed)) {
    for (const dirStops of Object.values(serviceRoutes)) {
      dirStops.sort((a, b) => a.StopSequence - b.StopSequence)
    }
  }

  writeFileSync(
    join(DATA_DIR, 'bus-routes.json'),
    JSON.stringify(indexed, null, 2),
    'utf8'
  )
  console.log(`  Wrote routes for ${Object.keys(indexed).length} services to public/data/bus-routes.json`)
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFareTable(): boolean {
  const data = JSON.parse(readFileSync(join(DATA_DIR, 'fare-table.json'), 'utf8'))
  if (!data.effectiveDate || !Array.isArray(data.bands)) {
    console.error('  fare-table.json: missing effectiveDate or bands array')
    return false
  }
  for (const band of data.bands) {
    const required = ['minKm', 'maxKm', 'adultCents', 'seniorCents', 'studentCents', 'workfareCents', 'pwdCents']
    for (const field of required) {
      if (typeof band[field] !== 'number') {
        console.error(`  fare-table.json: band missing field "${field}"`)
        return false
      }
    }
  }
  console.log(`  fare-table.json: OK (${data.bands.length} bands, effective ${data.effectiveDate})`)
  return true
}

function validateBusStops(): boolean {
  const data = JSON.parse(readFileSync(join(DATA_DIR, 'bus-stops.json'), 'utf8'))
  const count = Object.keys(data).length
  if (count === 0) {
    console.error('  bus-stops.json: empty')
    return false
  }
  console.log(`  bus-stops.json: OK (${count} stops)`)
  return true
}

function validateBusRoutes(): boolean {
  const data = JSON.parse(readFileSync(join(DATA_DIR, 'bus-routes.json'), 'utf8'))
  const count = Object.keys(data).length
  if (count === 0) {
    console.error('  bus-routes.json: empty')
    return false
  }
  console.log(`  bus-routes.json: OK (${count} services)`)
  return true
}

function validateMrtDistances(): boolean {
  const data = JSON.parse(readFileSync(join(DATA_DIR, 'mrt-distances.json'), 'utf8'))
  const lines = data.lines as Record<string, Record<string, number>> | undefined
  if (!lines || Object.keys(lines).length === 0) {
    console.error('  mrt-distances.json: missing or empty "lines" object')
    return false
  }
  const lineCount = Object.keys(lines).length
  const stationCount = Object.values(lines).reduce((s, l) => s + Object.keys(l).length, 0)
  console.log(`  mrt-distances.json: OK (${lineCount} lines, ${stationCount} station-line entries)`)
  return true
}

function validateExpressServices(): boolean {
  const data = JSON.parse(readFileSync(join(DATA_DIR, 'express-services.json'), 'utf8'))
  if (!Array.isArray(data)) {
    console.error('  express-services.json: not an array')
    return false
  }
  console.log(`  express-services.json: OK (${data.length} services)`)
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = getApiKey()

  if (!apiKey) {
    console.log('No LTA API key provided. Running validation only.')
    console.log('To refresh from LTA DataMall: npx tsx scripts/build-data.ts --key YOUR_KEY')
    console.log('Or set environment variable: LTA_API_KEY=your_key npx tsx scripts/build-data.ts')
    console.log('')
    console.log('Validating existing data files...')

    const results = [
      validateFareTable(),
      validateBusStops(),
      validateBusRoutes(),
      validateMrtDistances(),
      validateExpressServices(),
    ]

    if (results.every(Boolean)) {
      console.log('\nAll data files are valid.')
    } else {
      console.error('\nSome data files have issues. Check output above.')
      process.exit(1)
    }
    return
  }

  console.log('Refreshing LTA DataMall data...')
  try {
    await buildBusStops(apiKey)
    await buildBusRoutes(apiKey)
    console.log('\nDone! Please manually update fare-table.json and express-services.json')
    console.log('from https://www.ptc.gov.sg and LTA bus operator route schedules.')
  } catch (err) {
    console.error('Error fetching from LTA DataMall:', err)
    process.exit(1)
  }
}

main()
