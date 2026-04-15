import { PitchPhase } from '../types'

interface Props {
  pitchCount: number     // 현재 구수 (1-based)
  totalPitches: number   // 30
  score: number
  combo: number
  pitchPhase: PitchPhase
  countdown: number
  showZone: boolean
  onToggleZone?: () => void
}

export default function HUD({
  pitchCount, totalPitches, score, combo,
  pitchPhase, countdown, showZone, onToggleZone,
}: Props) {
  return (
    <div style={styles.hud}>
      {/* 왼쪽: 구수 카운터 */}
      <div style={styles.left}>
        <span style={styles.pitchLabel}>
          <span style={styles.pitchNum}>{pitchCount}</span>
          <span style={styles.pitchSep}>/</span>
          <span style={styles.pitchTotal}>{totalPitches}구</span>
        </span>
      </div>

      {/* 오른쪽: 점수/콤보 */}
      <div style={styles.right}>
        <div style={styles.score}>{score.toLocaleString()}점</div>
        {combo >= 2 && (
          <div style={styles.combo}>×{Math.min(1.0 + (combo - 1) * 0.1, 2.0).toFixed(1)} 콤보</div>
        )}
      </div>

      {/* 판정 카운트다운 */}
      {pitchPhase === 'judging' && (
        <div style={styles.countdown}>
          <span style={{ color: countdown <= 1 ? '#f44' : '#fff' }}>{countdown}</span>
        </div>
      )}

      {/* 존 표시 토글 버튼 */}
      {onToggleZone && (
        <button style={styles.zoneBtn} onClick={onToggleZone}>
          {showZone ? '존 숨기기' : '존 보기'}
        </button>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  hud: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontFamily: 'monospace',
    zIndex: 10,
    gap: 12,
  },
  left: { display: 'flex', alignItems: 'center' },
  pitchLabel: { display: 'flex', alignItems: 'baseline', gap: 2 },
  pitchNum: { fontSize: 24, fontWeight: 900 },
  pitchSep: { fontSize: 14, color: '#888' },
  pitchTotal: { fontSize: 14, color: '#aac' },
  right: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  score: { fontSize: 18, fontWeight: 700 },
  combo: { fontSize: 13, color: '#ffcc00' },
  countdown: {
    position: 'absolute',
    top: 60, right: 20,
    fontSize: 32,
    fontWeight: 900,
    color: '#fff',
    textShadow: '0 0 8px #000',
  },
  zoneBtn: {
    position: 'absolute',
    top: 60, left: 170,
    padding: '4px 10px',
    fontSize: 12,
    background: 'rgba(0,200,200,0.3)',
    border: '1px solid #0ff',
    color: '#0ff',
    borderRadius: 4,
    cursor: 'pointer',
  },
}
