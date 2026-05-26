/**
 * App.tsx
 *
 * Root component for FareCheck.SG — SimplyGo Concession Savings Calculator.
 *
 * Privacy: No network requests are made at runtime. All PDF processing
 * happens locally using pdfjs-dist in the browser.
 */

import { useState, useCallback, useEffect, useReducer, useRef } from 'react'
import { parseStatement } from './parser/parseStatement'
import { computeFare } from './fare/computeFare'
import { UploadDropzone } from './components/UploadDropzone'
import { SummaryCard } from './components/SummaryCard'
import { JourneyCard } from './components/JourneyCard'
import { CardTypeSelector, CARD_TYPE_STORAGE_KEY, DEFAULT_CARD_TYPE } from './components/CardTypeSelector'
import { Disclaimer } from './components/Disclaimer'
import type { Statement, FareResult, RefData } from './types'

// ─── State machine ────────────────────────────────────────────────────────────

type AppState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'results'; statement: Statement; fareResults: FareResult[] }
  | { phase: 'error'; message: string }

type AppAction =
  | { type: 'START_LOADING' }
  | { type: 'SET_RESULTS'; statement: Statement; fareResults: FareResult[] }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'RESET' }

function appReducer(_state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_LOADING': return { phase: 'loading' }
    case 'SET_RESULTS': return { phase: 'results', statement: action.statement, fareResults: action.fareResults }
    case 'SET_ERROR': return { phase: 'error', message: action.message }
    case 'RESET': return { phase: 'idle' }
  }
}

// ─── Reference data loader ────────────────────────────────────────────────────

async function loadRefData(): Promise<RefData> {
  const [fareTable, busStops, busRoutes, mrtDistances, expressServices] = await Promise.all([
    fetch('/data/fare-table.json').then(r => r.json()),
    fetch('/data/bus-stops.json').then(r => r.json()),
    fetch('/data/bus-routes.json').then(r => r.json()),
    fetch('/data/mrt-distances.json').then(r => r.json()),
    fetch('/data/express-services.json').then(r => r.json()),
  ])
  return { fareTable, busStops, busRoutes, mrtDistances, expressServices }
}

// Singleton cache — reference data is loaded once per session
let refDataCache: RefData | null = null
async function getRefData(): Promise<RefData> {
  if (!refDataCache) {
    refDataCache = await loadRefData()
  }
  return refDataCache
}

// ─── Brand wordmark ───────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <span className="font-semibold text-lg tracking-tight" aria-label="FareCheck.SG">
      <span className="text-white">FareCheck</span>
      <span className="text-white/70">.SG</span>
    </span>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onReset, showReset }: { onReset: () => void; showReset: boolean }) {
  return (
    <header className="bg-gradient-to-r from-brand-purple to-brand-magenta">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <Wordmark />
          <p className="text-white/80 text-xs mt-0.5">
            SimplyGo Concession Savings Calculator
          </p>
        </div>
        {showReset && (
          <button
            onClick={onReset}
            className="
              text-white/90 text-sm font-medium
              hover:text-white transition-colors
              min-h-[44px] min-w-[44px] flex items-center justify-center
              rounded-xl px-3
            "
            aria-label="Upload a new statement"
          >
            New upload
          </button>
        )}
      </div>
    </header>
  )
}

// ─── Upload screen ────────────────────────────────────────────────────────────

interface UploadScreenProps {
  onFile: (file: File) => void
  isLoading: boolean
  error?: string | null
  cardType: string
  onCardTypeChange: (v: string) => void
}

function UploadScreen({ onFile, isLoading, error, cardType, onCardTypeChange }: UploadScreenProps) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Hero */}
      <section aria-labelledby="hero-heading">
        <h1 id="hero-heading" className="text-2xl font-bold text-ink-DEFAULT">
          How much do you save with your concession card?
        </h1>
        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
          Upload your SimplyGo Transit Statement PDF and instantly see your concession savings
          versus adult fares. Everything is processed locally — your data never leaves this tab.
        </p>
      </section>

      {/* Card type */}
      <section aria-label="Card type selection">
        <CardTypeSelector value={cardType} onChange={onCardTypeChange} />
      </section>

      {/* Upload */}
      <section aria-label="PDF upload">
        <UploadDropzone onFile={onFile} isLoading={isLoading} error={error} />
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works-heading" className="rounded-2xl bg-surface-card border border-surface-border p-4">
        <h2 id="how-it-works-heading" className="text-sm font-semibold text-ink-DEFAULT mb-3">
          How it works
        </h2>
        <ol className="flex flex-col gap-2">
          {[
            ['Download', 'your SimplyGo Transit Statement PDF from the SimplyGo app (Transactions → select month → Download Statement)'],
            ['Upload', 'the PDF here — it stays in your browser, nothing is sent to any server'],
            ['See', 'your journey-by-journey concession savings vs. adult fares instantly'],
          ].map(([step, desc]) => (
            <li key={step} className="flex gap-2 text-sm">
              <span className="font-semibold text-brand-purple min-w-[72px] shrink-0">{step}</span>
              <span className="text-ink-muted">{desc}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

// ─── Results screen ───────────────────────────────────────────────────────────

interface ResultsScreenProps {
  statement: Statement
  fareResults: FareResult[]
  cardType: string
  onCardTypeChange: (v: string) => void
}

function ResultsScreen({ statement, fareResults, cardType, onCardTypeChange }: ResultsScreenProps) {
  return (
    <main
      className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4 pb-[env(safe-area-inset-bottom)]"
      id="results"
    >
      {/* Disclaimer (condensed at top of results) */}
      <Disclaimer condensed />

      {/* Drag-to-replace hint */}
      <p className="text-xs text-ink-muted text-center -mt-2 rounded-xl border border-dashed border-brand-purple/40 py-2 px-4">
        Drag a new PDF anywhere on this page to re-analyze
      </p>

      {/* Card type */}
      <CardTypeSelector value={cardType} onChange={onCardTypeChange} />

      {/* Summary */}
      <SummaryCard statement={statement} fareResults={fareResults} />

      {/* Journey list */}
      <section aria-labelledby="journeys-heading">
        <h2 id="journeys-heading" className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">
          {statement.journeys.length} Journeys
        </h2>
        <div className="flex flex-col gap-3">
          {statement.journeys.map((journey, idx) => {
            const fareResult = fareResults[idx] ?? { fare: null, reason: 'Not computed', adjustments: [] }
            const chargedCents = Math.round(journey.charged * 100)
            return (
              <JourneyCard
                key={`${journey.date}-${idx}`}
                journey={journey}
                fareResult={fareResult}
                chargedCents={chargedCents}
              />
            )
          })}
        </div>
      </section>
    </main>
  )
}

// ─── Page-level drop overlay (shown when dragging a file over results) ────────

function PageDropOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-brand-purple/10 flex items-center justify-center pointer-events-none">
      <div className="rounded-2xl border-2 border-dashed border-brand-purple bg-white/95 shadow-xl px-10 py-8 flex flex-col items-center gap-3">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-brand-purple/60">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-base font-semibold text-ink-DEFAULT">Drop to analyze new PDF</p>
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export function App() {
  const [state, dispatch] = useReducer(appReducer, { phase: 'idle' })

  // Card type — persisted to localStorage
  const [cardType, setCardType] = useState<string>(() => {
    try {
      return localStorage.getItem(CARD_TYPE_STORAGE_KEY) ?? DEFAULT_CARD_TYPE
    } catch {
      return DEFAULT_CARD_TYPE
    }
  })

  const handleCardTypeChange = useCallback((value: string) => {
    setCardType(value)
    try {
      localStorage.setItem(CARD_TYPE_STORAGE_KEY, value)
    } catch {
      // localStorage unavailable (private mode, etc.) — silently ignore
    }
  }, [])

  // Re-compute fares when card type changes while viewing results
  useEffect(() => {
    if (state.phase !== 'results') return

    const { statement } = state
    getRefData().then(refData => {
      const fareResults = statement.journeys.map(journey =>
        computeFare(journey, cardType, refData)
      )
      dispatch({ type: 'SET_RESULTS', statement, fareResults })
    }).catch(() => {
      // Reference data failed to load — keep existing results
    })
    // We intentionally omit state from the dependency array to avoid
    // infinite loops when dispatch updates state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType])

  const handleFile = useCallback(async (file: File) => {
    dispatch({ type: 'START_LOADING' })

    try {
      const buffer = await file.arrayBuffer()
      const statement = await parseStatement(buffer)
      const refData = await getRefData()
      const fareResults = statement.journeys.map(journey =>
        computeFare(journey, cardType, refData)
      )
      dispatch({ type: 'SET_RESULTS', statement, fareResults })
    } catch (err) {
      console.error('[FareCheck] PDF parse failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      dispatch({ type: 'SET_ERROR', message })
    }
  }, [cardType])

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const [isPageDragOver, setIsPageDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    if (state.phase !== 'results') return

    const onEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounterRef.current++
        setIsPageDragOver(true)
      }
    }
    const onLeave = () => {
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsPageDragOver(false)
      }
    }
    const onOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsPageDragOver(false)
      const file = e.dataTransfer?.files[0]
      if (file?.type === 'application/pdf') {
        handleFile(file)
      }
    }

    document.addEventListener('dragenter', onEnter)
    document.addEventListener('dragleave', onLeave)
    document.addEventListener('dragover', onOver)
    document.addEventListener('drop', onDrop)

    return () => {
      dragCounterRef.current = 0
      setIsPageDragOver(false)
      document.removeEventListener('dragenter', onEnter)
      document.removeEventListener('dragleave', onLeave)
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [state.phase, handleFile])

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white font-sans text-ink-DEFAULT">
      <Header
        onReset={handleReset}
        showReset={state.phase === 'results' || state.phase === 'error'}
      />

      <div className="flex-1">
        {(state.phase === 'idle' || state.phase === 'loading' || state.phase === 'error') && (
          <UploadScreen
            onFile={handleFile}
            isLoading={state.phase === 'loading'}
            error={state.phase === 'error' ? state.message : null}
            cardType={cardType}
            onCardTypeChange={handleCardTypeChange}
          />
        )}

        {state.phase === 'results' && (
          <ResultsScreen
            statement={state.statement}
            fareResults={state.fareResults}
            cardType={cardType}
            onCardTypeChange={handleCardTypeChange}
          />
        )}
      </div>

      {isPageDragOver && <PageDropOverlay />}

      <footer>
        <Disclaimer />
        <p className="text-center text-xs text-ink-muted mt-1 pb-2">
          Incorrect results?{' '}
          <a
            href="https://github.com/jaey8den/concession-fare-checker/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Report an issue on GitHub
          </a>
          {' '}or{' '}
          <a
            href="mailto:89349331+jaey8den@users.noreply.github.com"
            className="underline"
          >
            email the maintainer
          </a>
          {' '}— include a screenshot and any bus stop or train station names
          that appear incorrect.
        </p>
      </footer>
    </div>
  )
}
