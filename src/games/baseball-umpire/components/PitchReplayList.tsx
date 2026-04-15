import { PitchParams, PitchType } from '../types'

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
  pitches: PitchParams[]
  onSelect: (index: number) => void
  selectedIndex?: number
}

export default function PitchReplayList({ pitches, onSelect, selectedIndex = -1 }: Props) {
  if (pitches.length === 0) return null

  return (
    <div style={styles.wrap}>
      {pitches.map((p, i) => (
        <button
          key={i}
          style={{
            ...styles.item,
            background: p.correct === undefined
              ? 'rgba(100,100,100,0.7)'
              : p.correct
                ? 'rgba(76,175,80,0.7)'
                : 'rgba(244,67,54,0.7)',
            outline: i === selectedIndex ? '2px solid #ffee00' : 'none',
            outlineOffset: 1,
          }}
          onClick={() => onSelect(i)}
          title={`${PITCH_NAMES[p.pitchType]} ${p.speed}km/h`}
        >
          <span style={styles.num}>{i + 1}</span>
          {p.correct !== undefined && (
            <span style={styles.dot}>{p.correct ? '✓' : '✗'}</span>
          )}
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    bottom: 80, left: 20,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: 220,
    zIndex: 10,
  },
  item: {
    width: 34,
    height: 34,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.3)',
    cursor: 'pointer',
    color: '#fff',
    fontSize: 11,
    fontFamily: 'monospace',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  },
  num: { fontSize: 11, fontWeight: 700 },
  dot: { fontSize: 9 },
}
