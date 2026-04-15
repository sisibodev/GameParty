import { BatterProfile, PitchPhase } from '../types'

interface Props {
  batterIndex: number
  totalBatters: number
  balls: number
  strikes: number
  score: number
  combo: number
  batter: BatterProfile | null
  pitchPhase: PitchPhase
  countdown: number  // 판정 카운트다운 (초)
  showZone: boolean
  onToggleZone?: () => void
}

export default function HUD({
  batterIndex, totalBatters, balls, strikes, score, combo,
  batter, pitchPhase, countdown, showZone, onToggleZone,
}: Props) {
  return (
    <div style={styles.hud}>
      {/* 왼쪽: 타자 정보 */}
      <div style={styles.left}>
        <span style={styles.batterLabel}>타자 {batterIndex + 1}/{totalBatters}</span>
        {batter && (
          <span style={styles.batterInfo}>
            {heightLabel(batter.height)} {buildLabel(batter.build)} {batter.isLefty ? '좌타' : '우타'}
          </span>
        )}
      </div>

      {/* 중앙: 카운트 */}
      <div style={styles.center}>
        <CountDots label="B" count={balls} max={4} color="#4fc3f7" />
        <CountDots label="S" count={strikes} max={3} color="#ff7043" />
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

function CountDots({ label, count, max, color }: {
  label: string; count: number; max: number; color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color, fontWeight: 700, fontSize: 14, marginRight: 2 }}>{label}</span>
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: i < count ? color : 'rgba(255,255,255,0.2)',
            border: `1.5px solid ${color}`,
          }}
        />
      ))}
    </div>
  )
}

function heightLabel(h: string) {
  return h === 'short' ? '단신' : h === 'medium' ? '보통' : '장신'
}
function buildLabel(b: string) {
  return b === 'slim' ? '마름' : b === 'normal' ? '보통' : '다부짐'
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
  left: { display: 'flex', flexDirection: 'column', gap: 2 },
  batterLabel: { fontSize: 16, fontWeight: 700 },
  batterInfo: { fontSize: 12, color: '#ccc' },
  center: { display: 'flex', gap: 16 },
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
    top: 60, left: 20,
    padding: '4px 10px',
    fontSize: 12,
    background: 'rgba(0,200,200,0.3)',
    border: '1px solid #0ff',
    color: '#0ff',
    borderRadius: 4,
    cursor: 'pointer',
  },
}
