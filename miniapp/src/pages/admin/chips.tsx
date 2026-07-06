// Горизонтальные чипы-переключатели (общий паттерн для секций и сегментов)
export function Chips<T extends string>({ items, value, onChange }: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'auto' }}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          style={{
            border: 'none',
            borderRadius: 16,
            padding: '6px 14px',
            whiteSpace: 'nowrap',
            fontSize: 14,
            cursor: 'pointer',
            background: value === it.id
              ? 'var(--tgui--link_color, #2481cc)'
              : 'var(--tgui--secondary_fill, #f0f0f0)',
            color: value === it.id ? '#fff' : 'var(--tgui--text_color, #000)',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
