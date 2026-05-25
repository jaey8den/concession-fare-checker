/**
 * CardTypeSelector.tsx
 *
 * Allows the user to select their concession card type for fare comparison.
 * Selection is persisted to localStorage (key: "farecheck_card_type").
 * Only the card type preference is stored — no PII.
 */

const CARD_TYPES = [
  { value: 'MONEY SAVER', label: 'Adult (Money Saver)' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'SENIOR CITIZEN', label: 'Senior Citizen' },
  { value: 'WORKFARE', label: 'Workfare' },
  { value: 'PWD', label: 'Persons with Disabilities' },
] as const

export type CardTypeValue = (typeof CARD_TYPES)[number]['value']

interface CardTypeSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function CardTypeSelector({ value, onChange }: CardTypeSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="card-type-select"
        className="text-sm font-medium text-ink-DEFAULT"
      >
        Your concession card type
      </label>
      <select
        id="card-type-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="
          w-full rounded-xl border border-surface-border bg-white
          px-3 py-2.5 text-sm text-ink-DEFAULT
          focus:outline-none focus:ring-2 focus:ring-brand-purple/40
          min-h-[44px]
          appearance-none bg-no-repeat bg-right
        "
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 12px center',
          paddingRight: '40px',
        }}
      >
        {CARD_TYPES.map(ct => (
          <option key={ct.value} value={ct.value}>
            {ct.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export const CARD_TYPE_STORAGE_KEY = 'farecheck_card_type'
export const DEFAULT_CARD_TYPE: string = 'MONEY SAVER'
