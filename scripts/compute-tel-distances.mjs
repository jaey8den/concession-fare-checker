/**
 * Computes TEL station distances for mrt-distances.json.
 * Uses TEL cumulative distances and 4 interchange stations already in the file.
 * Outputs JSON additions ready to merge.
 */

// Cumulative distances along TEL from Woodlands North (km)
const telCum = {
  'woodlands north':   0.0,
  'woodlands':         1.5,   // NSL interchange (already in file)
  'springleaf':        5.4,
  'lentor':            7.0,
  'mayflower':         8.7,
  'bright hill':      10.4,
  'upper thomson':    12.2,
  'caldecott':        14.6,
  'stevens':          17.9,   // DTL interchange
  'napier':           19.4,
  'orchard boulevard': 21.0,
  'orchard':          22.2,   // NSL interchange (already in file)
  'great world':      23.9,
  'havelock':         25.3,
  'outram park':      26.8,   // NEL/EWL interchange (already in file)
  'maxwell':          28.2,
  'shenton way':      29.4,
  'marina bay':       30.6,   // NSL/CCL interchange (already in file)
  'gardens by the bay': 32.1,
  'tanjong rhu':      35.1,
  'katong park':      36.6,
  'tanjong katong':   38.1,
  'marine parade':    39.4,
  'marine terrace':   40.7,
  'siglap':           42.0,
  'bayshore':         43.3,
}

// Distance from each interchange station to non-TEL stations
// Sourced from existing mrt-distances.json
const interchange = {
  woodlands: {
    marsiling: 1.3, admiralty: 2.5, kranji: 3.8,
    'jurong east': 25.0, 'buona vista': 19.1, clementi: 21.1,
    bishan: 11.1, 'ang mo kio': 10.2, yishun: 3.7,
    sembawang: 2.0, canberra: 1.3,
    'city hall': 20.8, 'raffles place': 19.0,
    'changi airport': 36.2, bedok: 24.5,
  },
  orchard: {
    'dhoby ghaut': 0.8, somerset: 0.4,
    'city hall': 2.0, 'raffles place': 2.7,
    newton: 1.3, novena: 1.8,
    'toa payoh': 3.5, bishan: 7.3,
    'buona vista': 6.8, clementi: 8.8,
    'jurong east': 11.5, 'ang mo kio': 10.3,
    'marina bay': 3.6, 'changi airport': 14.5,
    'tanah merah': 9.7, woodlands: 18.8,
    bedok: 8.8, tampines: 13.4, 'pasir ris': 16.2,
  },
  'outram park': {
    'tanjong pagar': 1.0, 'raffles place': 1.9,
    'tiong bahru': 1.0, redhill: 3.2,
    clementi: 8.0, 'jurong east': 11.9, 'buona vista': 6.0,
  },
  'marina bay': {
    'raffles place': 1.5, 'city hall': 2.3, 'dhoby ghaut': 2.8,
    'buona vista': 9.8, clementi: 11.8,
    'changi airport': 16.2, 'jurong east': 15.5,
  },
}

const interchangeNames = Object.keys(interchange)

/** Shortest distance from TEL station X to non-TEL target Y, via any interchange */
function crossLineDist(xName, yName) {
  const dX = telCum[xName]
  if (dX === undefined) return Infinity

  let best = Infinity
  for (const ixName of interchangeNames) {
    const dIx = telCum[ixName]
    if (dIx === undefined) continue
    const onTEL = Math.abs(dX - dIx)
    const offTEL = interchange[ixName][yName]
    if (offTEL !== undefined) {
      best = Math.min(best, onTEL + offTEL)
    }
  }
  return best
}

/** Round to 1 decimal */
function r1(x) { return Math.round(x * 10) / 10 }

// All TEL station names
const telStations = Object.keys(telCum)

// Stations already in the file (interchange or otherwise)
const alreadyInFile = new Set(['woodlands', 'orchard', 'outram park', 'marina bay'])

// All non-TEL target stations gathered from interchange tables
const crossLineTargets = [...new Set(
  Object.values(interchange).flatMap(m => Object.keys(m))
)].filter(s => !(s in telCum))

// Build the additions
const additions = {}

for (const station of telStations) {
  if (alreadyInFile.has(station)) continue // will handle updates separately

  const entry = {}

  // All other TEL stations
  for (const other of telStations) {
    if (other === station) continue
    const d = r1(Math.abs(telCum[station] - telCum[other]))
    entry[other] = d
  }

  // Cross-line distances
  for (const target of crossLineTargets) {
    const d = crossLineDist(station, target)
    if (d !== Infinity) {
      entry[target] = r1(d)
    }
  }

  additions[station] = entry
}

// Also compute what to ADD to existing interchange station entries
// (just the TEL-only stations, since interchanges already have NSL/EWL entries)
const interchangeAdditions = {}
for (const ixName of interchangeNames) {
  const additions_ix = {}
  for (const tel of telStations) {
    if (alreadyInFile.has(tel)) continue // already in file or self
    if (tel === ixName) continue
    additions_ix[tel] = r1(Math.abs(telCum[ixName] - telCum[tel]))
  }
  interchangeAdditions[ixName] = additions_ix
}

// Output
console.log('=== NEW TEL STATION ENTRIES ===')
console.log(JSON.stringify(additions, null, 2))
console.log('\n=== ADDITIONS TO EXISTING INTERCHANGE ENTRIES ===')
console.log(JSON.stringify(interchangeAdditions, null, 2))
