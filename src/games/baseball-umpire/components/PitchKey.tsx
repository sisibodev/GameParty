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
      <button
        style={{ ...styles.btn, ...styles.ball, opacity: active ? 1 : 0.4 }}
        onClick={active ? onBall : undefined}
      >
        <span style={styles.key}>B</span>
        <span style={styles.label}>볼</span>
      </button>
      <div style={styles.hint}>
        {active ? '판정하세요!' : '투구 대기 중'}
      </div>
      <button
        style={{ ...styles.btn, ...styles.strike, opacity: active ? 1 : 0.4 }}
        onClick={active ? onStrike : undefined}
      >
        <span style={styles.key}>S</span>
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
    gap: 20,
    zIndex: 10,
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 24px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'transform 0.1s',
  },
  ball: {
    background: 'rgba(33,150,243,0.85)',
    color: '#fff',
  },
  strike: {
    background: 'rgba(255,87,34,0.85)',
    color: '#fff',
  },
  key: { fontSize: 22, fontWeight: 900, lineHeight: 1 },
  label: { fontSize: 12 },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'center',
    minWidth: 80,
  },
}
