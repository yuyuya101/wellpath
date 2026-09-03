'use client';

/**
 * Reusable onboarding field primitives (design-system v2).
 * Every control is touch-friendly (>=44px), keyboard focusable,
 * and lays out as a responsive grid that stacks on mobile.
 */
import type { ReactNode } from 'react';

/* ---------------- container: responsive option grid ---------------- */
export function OptionGrid({
  children,
  cols,
}: {
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return <div className={cols === 2 ? 'opt-grid cols-2' : 'opt-grid'}>{children}</div>;
}

export function OptionStack({ children }: { children: ReactNode }) {
  return <div className="opt-stack">{children}</div>;
}

/* ---------------- single / multi selectable card ---------------- */
export function OptionCard({
  selected,
  onSelect,
  label,
  hint,
  icon,
  multi = false,
  ariaLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  icon?: ReactNode;
  multi?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel ?? label}
      onClick={onSelect}
      className={`opt-card${selected ? ' selected' : ''}${multi ? ' multi' : ''}`}
    >
      {icon && <span className="opt-icon" aria-hidden>{icon}</span>}
      <span className="opt-label">
        {label}
        {hint && <span className="opt-hint">{hint}</span>}
      </span>
      <span className="opt-mark" aria-hidden>{selected ? (multi ? '✓' : '●') : ''}</span>
    </button>
  );
}

/* ---------------- compact multi-select chips ---------------- */
export function ChipMulti({
  options,
  values,
  onToggle,
}: {
  options: Array<{ value: string; label: string }>;
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="chip-row" role="group" aria-label="multi select">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            className={`chip${on ? ' selected' : ''}`}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- numeric field ---------------- */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  placeholder,
  min,
  max,
  step = 1,
  error,
  hint,
  ariaLabel,
}: {
  label?: string;
  value: number | '';
  onChange: (n: number | '') => void;
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
  hint?: string;
  ariaLabel?: string;
}) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          className="num-input"
          type="number"
          inputMode="decimal"
          aria-label={ariaLabel ?? label}
          value={value === '' ? '' : value}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={unit ? { paddingRight: 56 } : undefined}
        />
        {unit && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {error && <p className="field-err" role="alert">{error}</p>}
      {hint && !error && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/* ---------------- top bar + segmented progress ---------------- */
export function OnbTopBar({ section, onBack }: { section: string; onBack?: () => void }) {
  return (
    <div className="onb-topbar">
      <button type="button" className="onb-back" aria-label="Back" onClick={onBack}>
        ‹
      </button>
      <div className="onb-section">{section}</div>
      <div className="onb-spacer" />
    </div>
  );
}

export function SectionProgress({ total, current }: { total: number; current: number }) {
  return (
    <div className="onb-progress" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`onb-seg${i < current ? ' done' : i === current ? ' current' : ''}`} />
      ))}
    </div>
  );
}

/* ---------------- fixed bottom action bar ---------------- */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="action-bar">
      <div className="bar-inner">{children}</div>
    </div>
  );
}
