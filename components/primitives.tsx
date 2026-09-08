import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/lib/selectors'

export function Badge({ children, tone = 'gray', title }: { children: React.ReactNode; tone?: Tone; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>
}

export function PageHeader({ eyebrow, title, desc, children }: { eyebrow: string; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {children ? <div className="catalog-actions">{children}</div> : null}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone, onClick }: { label: string; value: string; hint: string; icon: LucideIcon; tone: Tone; onClick?: () => void }) {
  const body = (
    <>
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </>
  )
  return onClick
    ? <button type="button" className="stat-card stat-card-button" onClick={onClick}>{body}</button>
    : <div className="stat-card">{body}</div>
}

export function SectionTitle({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="calm-section-title">
      <div>
        <h3>{title}</h3>
        {hint ? <small>{hint}</small> : null}
      </div>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, desc, children }: { icon: LucideIcon; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="calm-empty">
      <Icon size={25} />
      <strong>{title}</strong>
      <p>{desc}</p>
      {children}
    </div>
  )
}

export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return <span className={small ? 'person-avatar person-avatar-sm' : 'person-avatar'}>{name.slice(0, 1)}</span>
}
