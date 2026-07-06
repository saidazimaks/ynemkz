// Горизонтальные чипы-переключатели (общий паттерн, стили — .vg-chip в index.css)
export function Chips<T extends string>({ items, value, onChange }: {
  items: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="vg-chips" style={{ padding: '12px 16px 6px' }}>
      {items.map((it) => (
        <button
          key={it.id}
          className={`vg-chip ${value === it.id ? 'is-on' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
