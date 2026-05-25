// Core data contracts — field names are canonical, do not rename

export interface Statement {
  monthLabel: string;    // "April 2026"
  periodStart: string;   // ISO date "2026-04-01"
  periodEnd: string;     // ISO date "2026-04-30"
  cardType: string;      // "MONEY SAVER"
  journeys: Journey[];
  totalCharged: number;  // dollars, from "Total: $X.XX" footer row
}

export interface Journey {
  date: string;          // ISO date "2026-04-03"
  dayOfWeek: string;     // "Thu"
  origin: string;
  destination: string;
  legs: Leg[];
  charged: number;       // 0 for Pass Usage, else dollars
}

export interface Leg {
  time: string;          // "11:10 PM"
  timestamp: string;     // ISO datetime "2026-04-03T23:10:00"
  mode: 'train' | 'bus';
  busService?: string;   // "107M" if mode === 'bus'
  fromStop: string;
  toStop: string;
}

export interface FareResult {
  fare: number | null;           // cents, null if unresolvable
  reason?: string;               // populated when fare is null
  adjustments: FareAdjustment[];
}

export interface FareAdjustment {
  label: string;          // "Pre-peak discount"
  deltaCents: number;     // negative for discounts
}

// Reference data shapes loaded from public/data/

export interface FareTable {
  effectiveDate: string;
  bands: FareBand[];
}

export interface FareBand {
  minKm: number;
  maxKm: number;
  adultCents: number;
  seniorCents: number;
  studentCents: number;
  workfareCents: number;
  pwdCents: number;
}

export interface BusStop {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
}

export type BusStopsMap = Record<string, BusStop>;

export interface BusRouteStop {
  ServiceNo: string;
  Operator: string;
  Direction: number;
  StopSequence: number;
  BusStopCode: string;
  Distance: number; // km from start
}

export type BusRoutesMap = Record<string, Record<number, BusRouteStop[]>>;

// mrt-distances.json: per-line cumulative distances from terminus
export interface MrtDistances {
  lines: Record<string, Record<string, number>>;
  // line code (e.g. "NSL", "EWL", "EWL_CG") → normalised station name → cumulative km from terminus
  // Same-line distance: |cum[A] - cum[B]|
  // Cross-line distance: min over all interchange stations of
  //   |cum_lineA[origin] - cum_lineA[ix]| + |cum_lineB[ix] - cum_lineB[dest]|
  // Branch lines (EWL_CG, CCL_CE) use their junction as cum=0 so branches don't
  // collide with main-line stations having the same cumulative distance.
}

export type ExpressServices = string[];

export interface RefData {
  fareTable: FareTable;
  busStops: BusStopsMap;
  busRoutes: BusRoutesMap;
  mrtDistances: MrtDistances;
  expressServices: ExpressServices;
}
