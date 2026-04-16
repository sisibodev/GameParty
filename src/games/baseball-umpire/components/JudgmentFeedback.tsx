import { JudgmentFeedback as JFeedback, PitchType } from '../types'

const PITCH_NAMES: Record<PitchType, string> = {
  fastball:  '직구',
  two_seam:  '투심',
  sinker:    '싱커',
  cutter:    '커터',
  changeup:  '체인지업',
  slider:    '슬라이더',
  sweeper:   '스위퍼',
  curve:     '커브',
  splitter:  '스플리터',
  forkball:  '포크볼',
}

interface Props {
  feedback: JFeedback | null
}

export default function JudgmentFeedback({ feedback }: Props) {
  if (!feedback) return null

  const isBorderline = feedback.isBorderline && feedback.correct
  const callText = feedback.call === 'strike' ? 'STRIKE!' : 'BALL!'
  const mainColor = feedback.call === 'strike' ? '#ff5722' : '#2196f3'

  return (
    <div style={styles.overlay}>
      {/* 구종 + 구속 */}
      <div style={styles.pitchInfo}>
        <span style={styles.pitchType}>{PITCH_NAMES[feedback.pitchType]}</span>
        <span style={styles.pitchSpeed}>{feedback.speed} km/h</span>
      </div>

      {/* 판정 텍스트 */}
      <div style={{ ...styles.callText, color: mainColor }}>
        {callText}
      </div>

      {/* 보더라인 특수 연출 */}
      {isBorderline && (
        <div style={styles.borderline}>🔥 BORDERLINE!</div>
      )}

      {/* 정답/오답 */}
      <div style={{ ...styles.result, color: feedback.correct ? '#4caf50' : '#f44336' }}>
        {feedback.correct ? '✅ 정확!' : '❌ 오심'}
      </div>

      {/* 점수 변화 */}
      <div style={{
        ...styles.scoreChange,
        color: feedback.scoreChange >= 0 ? '#ffeb3b' : '#f44336'
      }}>
        {feedback.scoreChange >= 0 ? '+' : ''}{feedback.scoreChange}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    top: '18%',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'none',
    zIndex: 26,
    whiteSpace: 'nowrap',
  },
  pitchInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    padding: '4px 14px',
    marginBottom: 4,
  },
  pitchType: {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    textShadow: '1px 1px 4px #000',
  },
  pitchSpeed: {
    fontSize: 15,
    fontWeight: 700,
    color: '#ffeb3b',
    textShadow: '1px 1px 4px #000',
  },
  callText: {
    fontSize: 64,
    fontWeight: 900,
    textShadow: '2px 2px 12px rgba(0,0,0,0.8)',
    letterSpacing: 2,
  },
  borderline: {
    fontSize: 26,
    fontWeight: 700,
    color: '#ff9800',
    textShadow: '1px 1px 6px #000',
  },
  result: {
    fontSize: 22,
    fontWeight: 700,
    textShadow: '1px 1px 4px #000',
  },
  scoreChange: {
    fontSize: 28,
    fontWeight: 900,
    textShadow: '1px 1px 6px #000',
  },
}
