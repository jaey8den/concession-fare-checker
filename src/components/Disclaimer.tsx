/**
 * Disclaimer.tsx
 *
 * Legal disclaimer component — must appear on every screen.
 * Verbatim text mandated by the spec.
 */

interface DisclaimerProps {
  condensed?: boolean
}

export function Disclaimer({ condensed = false }: DisclaimerProps) {
  if (condensed) {
    return (
      <p className="text-xs italic text-ink-muted text-center px-4">
        Not affiliated with SimplyGo, TransitLink, LTA, or PTC. Fare estimates may differ from
        official fares. For personal informational purposes only.
      </p>
    )
  }

  return (
    <div className="px-4 py-4 border-t border-surface-border">
      <p className="text-xs text-ink-muted text-center leading-relaxed max-w-2xl mx-auto">
        <strong>Disclaimer:</strong> This tool is not affiliated with, endorsed by, or connected
        to SimplyGo, TransitLink Pte Ltd, the Land Transport Authority (LTA), the Public Transport
        Council (PTC), or any Singapore government agency. Fare estimates are calculated from
        publicly available data and may differ from official fares due to data lag, edge cases, or
        fare structure changes. Use for personal informational purposes only.
      </p>
    </div>
  )
}
