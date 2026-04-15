/**
 * 하단 판정 키 안내 UI
 */
interface Props {
  active: boolean
  onStrike: () => void
  onBall: () => void
}

export default function PitchKey({ active, onStrike, onBall }: Props) {
  return (
    <div style={styles.wrap}>
      {/* 볼 버튼 */}
      <button
        style={{ ...styles.btn, ...styles.ball, opacity: active ? 1 : 0.4 }}
        onClick={active ? onBall : undefined}
      >
        <div style={styles.keys}>
          <span style={styles.keyChip}>B</span>
          <span style={styles.keyDivider}>/</span>
          <span style={styles.keyChip}>←</span>
        </div>
        <span style={styles.label}>볼</span>
      </button>

      {/* 중앙 안내 */}
      <div style={styles.center}>
        <div style={styles.hint}>
          {active ? '판정하세요!' : '투구 대기 중'}
        </div>
        {!active && (
          <div style={styles.keyGuide}>
            <span style={styles.guideItem}><span style={styles.guideKey}>B</span> / <span style={styles.guideKey}>←</span> 볼</span>
            <span style={styles.guideSep}>·</span>
            <span style={styles.guideItem}><span style={styles.guideKey}>S</span> / <span style={styles.guideKey}>→</span> 스트라이크</span>
          </div>
        )}
      </div>

      {/* 스트라이크 버튼 */}
      <button
        style={{ ...styles.btn, ...styles.strike, opacity: active ? 1 : 0.4 }}
        onClick={active ? onStrike : undefined}
      >
        <div style={styles.keys}>
          <span style={styles.keyChip}>S</span>
          <span style={styles.keyDivider}>/</span>
          <span style={styles.keyChip}>→</span>
        </div>
        <span style={styles.label}>스트라이크</span>
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    bottom: 20, left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'transform 0.1s',
  },
  ball:   { background: 'rgba(33,150,243,0.85)', color: '#fff' },
  strike: { background: 'rgba(255,87,34,0.85)',  color: '#fff' },
  keys: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  keyChip: {
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    padding: '1px 6px',
  },
  keyDivider: {
    fontSize: 12,
    opacity: 0.6,
  },
  label: { fontSize: 12 },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 100,
  },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'center',
    fontWeight: 600,
  },
  keyGuide: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    padding: '3px 8px',
  },
  guideItem: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  guideKey: {
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    padding: '0px 4px',
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
  },
  guideSep: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
  },
}
