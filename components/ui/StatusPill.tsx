export type PillTone = 'good' | 'warning' | 'serious' | 'critical' | 'info' | 'purple' | 'neutral';

const TONE_VARS: Record<PillTone, { bg: string; text: string }> = {
  good:     { bg: 'var(--good)',     text: 'var(--good-text)' },
  warning:  { bg: 'var(--warning)',  text: 'var(--warning-text)' },
  serious:  { bg: 'var(--serious)',  text: 'var(--serious-text)' },
  critical: { bg: 'var(--critical)', text: 'var(--critical-text)' },
  info:     { bg: 'var(--info)',     text: 'var(--info-text)' },
  purple:   { bg: 'var(--purple)',   text: 'var(--purple-text)' },
  neutral:  { bg: 'var(--neutral)',  text: 'var(--neutral-text)' },
};

// 'inline' — a small rounded chip for use inline among other text.
// 'cell'   — monday.com's actual table-status look: a small-radius block that
// fills its <td> edge to edge. Pair with a zero-padding <td> at the call site.
export default function StatusPill({
  tone,
  children,
  size = 'inline',
}: {
  tone: PillTone;
  children: React.ReactNode;
  size?: 'inline' | 'cell';
}) {
  const { bg, text } = TONE_VARS[tone];
  const cell = size === 'cell';
  return (
    <span
      style={{
        display: cell ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: text,
        borderRadius: cell ? 4 : 999,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        fontSize: cell ? 12.5 : 11,
        width: cell ? '100%' : undefined,
        height: cell ? '100%' : undefined,
        minHeight: cell ? 34 : undefined,
        padding: cell ? '7px 10px' : '3px 10px',
      }}
    >
      {children}
    </span>
  );
}
