/**
 * UploadDropzone.tsx
 *
 * PDF upload area with drag-and-drop support.
 * The PDF bytes never leave the browser — parseStatement is called locally.
 */

import { useState, useRef, useCallback } from 'react'

interface UploadDropzoneProps {
  onFile: (file: File) => void
  isLoading: boolean
  error?: string | null
}

function UploadIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-brand-purple/60"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-emerald-500"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

export function UploadDropzone({ onFile, isLoading, error }: UploadDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      const file = e.dataTransfer.files[0]
      if (file && file.type === 'application/pdf') {
        onFile(file)
      }
    },
    [onFile]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onFile(file)
        // Reset input so the same file can be re-selected
        e.target.value = ''
      }
    },
    [onFile]
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }, [])

  return (
    <div className="w-full">
      {/* Drop area */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload your SimplyGo Transit Statement PDF. Click or drag and drop."
        aria-busy={isLoading}
        className={`
          relative w-full rounded-2xl border-2 border-dashed
          transition-colors duration-150 cursor-pointer
          flex flex-col items-center justify-center
          min-h-[220px] p-6 text-center
          focus:outline-none focus:ring-2 focus:ring-brand-purple/40
          ${isDragActive
            ? 'border-brand-purple bg-brand-purple/5'
            : 'border-brand-purple/40 bg-surface-card hover:border-brand-purple hover:bg-brand-purple/5'
          }
          ${isLoading ? 'opacity-60 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={handleChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-brand-purple/20 border-t-brand-purple animate-spin"
              role="status"
              aria-label="Parsing PDF"
            />
            <p className="text-sm text-ink-muted">Parsing your statement…</p>
            <p className="text-xs text-ink-muted">Everything stays in your browser</p>
          </div>
        ) : (
          <>
            <UploadIcon />
            <div className="mt-3">
              <p className="text-sm font-semibold text-ink-DEFAULT">
                {isDragActive ? 'Drop your PDF here' : 'Upload your SimplyGo statement'}
              </p>
              <p className="text-xs text-ink-muted mt-1">
                Drag & drop or{' '}
                <span className="text-brand-purple font-medium underline underline-offset-2">
                  browse
                </span>
              </p>
            </div>
            <p className="text-xs text-ink-muted mt-2">PDF only · April 2026 format supported</p>

            {/* Privacy badge */}
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
              <ShieldIcon />
              <span className="text-xs text-emerald-700 font-medium">
                Your PDF never leaves this browser
              </span>
            </div>
          </>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
        >
          <p className="text-sm text-red-700">
            <strong>Could not parse PDF. </strong>
            {error}
          </p>
          <p className="text-xs text-red-600 mt-1">
            Is this a SimplyGo Transit Statement PDF?{' '}
            <a
              href="https://github.com/jaey8den/concession-fare-checker/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Report an issue
            </a>
            {' '}— please include a screenshot and any bus stop or train station
            names that look wrong so they can be excluded or corrected.
          </p>
        </div>
      )}
    </div>
  )
}
