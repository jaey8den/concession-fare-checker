/**
 * ModeChip.tsx
 *
 * Small pill-shaped chip indicating transport mode (bus or train).
 * Uses inline SVG icons — no external icon library at runtime.
 */

interface ModeChipProps {
  mode: 'train' | 'bus'
  service?: string
}

function TrainIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Train body */}
      <rect x="4" y="3" width="16" height="14" rx="3" />
      {/* Windows */}
      <line x1="8" y1="7" x2="8" y2="11" />
      <line x1="16" y1="7" x2="16" y2="11" />
      {/* Bottom rail */}
      <path d="M6 17l-2 4" />
      <path d="M18 17l2 4" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </svg>
  )
}

function BusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Bus body */}
      <path d="M8 6v6" />
      <path d="M16 6v6" />
      <path d="M2 12h19.6" />
      <path d="M18 18h2a1 1 0 0 0 1-1v-5.34a4 4 0 0 0-.76-2.3L17.4 5.8A4 4 0 0 0 14.17 4H4a2 2 0 0 0-2 2v12h2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="15" cy="18" r="2" />
    </svg>
  )
}

export function ModeChip({ mode, service }: ModeChipProps) {
  const isTrain = mode === 'train'
  const label = isTrain ? 'Train' : service ?? 'Bus'
  const ariaLabel = isTrain ? 'MRT/LRT train' : `Bus service ${service ?? ''}`

  return (
    <span
      className={`
        rounded-full border border-surface-border px-2 py-0.5
        text-xs inline-flex items-center gap-1
        ${isTrain ? 'text-brand-purple bg-brand-purple/5' : 'text-brand-magenta bg-brand-magenta/5'}
      `}
      aria-label={ariaLabel}
    >
      {isTrain ? <TrainIcon /> : <BusIcon />}
      <span>{label}</span>
    </span>
  )
}
