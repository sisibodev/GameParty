import { PitchParams, PitchType } from '../types'

const PITCH_NAMES: Record<PitchType, string> = {
  fastball:  '직구',
  two_seam:  '투심',
  changeup:  '체인지업',
  slider:    '슬라이더',
  curve:     '커브',
  splitter:  '스플리터',
}

interface Props {
  pitch: PitchParams
  speed: number
  isPlaying: boolean
  onSpeedChange: (s: number) => void
  onReplay: () => void
  onClose: () => void
}

const SPEEDS = [0.25, 0.5, 1]

export default function ReplayControls({
  pitch, speed, isPlaying, onSpeedChange, onReplay, onClose
}: Props) {
  const callColor = pitch.playerCall === 'strike' ? '#ff5722' : '#2196f3'
  const correctColor = pitch.correct ? '#4caf50' : '#f44336'

  return (
    <div style={styles.wrap}>
      {/* 헤더 */}
      <div style={styles.header}>
        <span style={styles.title}>REPLAY</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* 투구 정보 */}
      <div style={styles.info}>
        <span style={styles.pitchNum}>#{pitch.pitchIndex + 1}</span>
        <span style={styles.pitchType}>{PITCH_NAMES[pitch.pitchType]}</span>
        <span style={styles.speed}>{pitch.speed}km/h</span>
        {pitch.isBorderline && <span style={styles.borderline}>BORDERLINE</span>}
      </div>

      {/* 판정 결과 */}
      <div style={styles.result}>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>실제</span>
          <span style={{ ...styles.resultValue, color: pitch.isStrike ? '#ff5722' : '#2196f3' }}>
            {pitch.isStrike ? '스트라이크' : '볼'}
          </span>
        </div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>내 판정</span>
          <span style={{ ...styles.resultValue, color: callColor }}>
            {pitch.playerCall === 'strike' ? '스트라이크' : '볼'}
          </span>
        </div>
        <div style={styles.resultItem}>
          <span style={styles.resultLabel}>결과</span>
          <span style={{ ...styles.resultValue, color: correctColor }}>
            {pitch.correct ? '✓ 정확' : '✗ 오심'}
          </span>
        </div>
      </div>

      {/* 재생 속도 */}
      <div style={styles.speedRow}>
        <span style={styles.speedLabel}>속도</span>
        {SPEEDS.map(s => (
          <button
            key={s}
            style={{
              ...styles.speedBtn,
              background: speed === s ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.08)',
              borderColor: speed === s ? '#00e5ff' : 'rgba(255,255,255,0.2)',
              color: speed === s ? '#00e5ff' : '#fff',
            }}
            onClick={() => onSpeedChange(s)}
          >
            {s === 1 ? '1×' : `${s}×`}
          </button>
        ))}
      </div>

      {/* 다시 재생 버튼 */}
      <button
        style={{ ...styles.replayBtn, opacity: isPlaying ? 0.5 : 1 }}
        onClick={onReplay}
        disabled={isPlaying}
      >
        {isPlaying ? '재생 중...' : '▶ 다시 재생'}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    top: '50%',
    right: 20,
    transform: 'translateY(-50%)',
    background: 'rgba(10,18,35,0.92)',
    border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 12,
    padding: '12px 14px',
    minWidth: 200,
    zIndex: 30,
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: 900,
    color: '#00e5ff',
    letterSpacing: 2,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  },
  info: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pitchNum: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  pitchType: {
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
  },
  speed: {
    fontSize: 13,
    color: '#ffeb3b',
    fontWeight: 700,
  },
  borderline: {
    fontSize: 10,
    color: '#ff9800',
    fontWeight: 700,
    background: 'rgba(255,152,0,0.15)',
    borderRadius: 4,
    padding: '1px 5px',
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  resultItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  resultValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  speedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  speedLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginRight: 2,
  },
  speedBtn: {
    flex: 1,
    padding: '4px 0',
    border: '1px solid',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  replayBtn: {
    width: '100%',
    padding: '7px 0',
    background: 'rgba(0,229,255,0.15)',
    border: '1px solid rgba(0,229,255,0.5)',
    borderRadius: 7,
    color: '#00e5ff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
}
