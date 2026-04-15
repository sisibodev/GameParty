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

      {/* 중앙: 판정 중 단축키 안내 */}
      <div style={styles.center}>
        {pitchPhase === 'judging' ? (
          <div style={styles.keyHint}>
            <span style={styles.keyItem}><span style={styles.keyBadge}>←</span><span style={styles.keyBadge}>B</span> 볼</span>
            <span style={styles.keySep}>|</span>
            <span style={styles.keyItem}>스트라이크 <span style={styles.keyBadge}>S</span><span style={styles.keyBadge}>→</span></span>
          </div>
        ) : (
          <div style={styles.keyHintDim}>
            <span style={styles.keyBadgeDim}>←</span><span style={styles.keyBadgeDim}>B</span>
            <span style={styles.dimSep}> 볼 · 스트라이크 </span>
            <span style={styles.keyBadgeDim}>S</span><span style={styles.keyBadgeDim}>→</span>
          </div>
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
  left:   { display: 'flex', alignItems: 'center' },
  center: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  keyHint: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 8, padding: '4px 14px',
    animation: 'pulse 1.2s infinite',
  },
  keyItem: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 12, fontWeight: 700, color: '#fff',
  },
  keyBadge: {
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 4, padding: '1px 6px',
    fontSize: 11, fontWeight: 900,
    border: '1px solid rgba(255,255,255,0.35)',
  },
  keySep: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  keyHintDim: {
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: 11, color: 'rgba(255,255,255,0.25)',
  },
  keyBadgeDim: {
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 3, padding: '0px 4px',
    fontSize: 10, fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.12)',
  },
  dimSep: { fontSize: 11, color: 'rgba(255,255,255,0.2)' },
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
