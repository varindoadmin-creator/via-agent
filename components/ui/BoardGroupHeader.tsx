export default function BoardGroupHeader({
  label,
  count,
  color,
  collapsed,
  onToggleCollapse,
}: {
  label: string;
  count?: number;
  color: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const clickable = !!onToggleCollapse;
  return (
    <div
      onClick={onToggleCollapse}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 12px 8px',
        cursor: clickable ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color,
          transition: 'transform 0.15s',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          flexShrink: 0,
        }}
      >
        ▾
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: '-0.01em' }}>
        {label}
      </span>
      {typeof count === 'number' && (
        <span style={{ fontSize: 12, color: 'var(--text-4)', fontFamily: 'JetBrains Mono, monospace' }}>
          {count}
        </span>
      )}
    </div>
  );
}
