import { BatterProfile, PitcherForm } from '../types'

interface MultiRankEntry {
  uid: string
  email: string
  score: number
}

interface Props {
  batterIndex: number
  totalBatters: number
  batter: BatterProfile | null
  pitchCount: number     // 1-based, current pitch number
  totalPitches: number
  pitcherForm?: PitcherForm | null
  pitcherLefty?: boolean | null
  multiRankings?: MultiRankEntry[]
  myUid?: string
}

const HEIGHT_LABEL: Record<string, string> = { short: '단신 (165cm)', medium: '보통 (178cm)', tall: '장신 (190cm)' }
const BUILD_LABEL:  Record<string, string> = { slim: '마른', normal: '보통', stocky: '다부짐' }
const STANCE_LABEL: Record<string, string> = { low: '낮은', mid: '표준', high: '높은' }

const FORM_LABEL: Record<PitcherForm, string> = {
  overhand:      '오버핸드',
  three_quarter: '쓰리쿼터',
  sidearm:       '사이드암',
  underhand:     '언더핸드',
}
// 시계 방향 팔 각도로 폼 직관적 표현
const FORM_CLOCK: Record<PitcherForm, string> = {
  overhand:      '12시',
  three_quarter: '10시',
  sidearm:       '3시',
  underhand:     '6시',
}
const FORM_COLOR: Record<PitcherForm, string> = {
  overhand:      '#7ecfff',
  three_quarter: '#a0e0a0',
  sidearm:       '#ffd580',
  underhand:     '#ff9fa0',
}

export default function LeftPanel({
  batterIndex, totalBatters, batter, pitchCount, totalPitches,
  pitcherForm, pitcherLefty, multiRankings, myUid,
}: Props) {
  // SVG 미니 스트라이크존
  const svgW = 120
  const svgH = 160
  const plateHalfW = 0.215  // Three.js units
  const padding = 14

  const toSvgX = (x: number) =>
    svgW / 2 + (x / (plateHalfW * 3.5)) * (svgW / 2 - padding)

  const toSvgY = (y: number, yMin: number, yMax: number) => {
    const range = yMax - yMin
    const normalized = (y - yMin) / range
    return svgH - padding - normalized * (svgH - padding * 2)
  }

  const zoneMinY = batter ? batter.zoneBottom * 0.6 : 0
  const zoneMaxY = batter ? batter.zoneTop * 1.15 : 1

  const zxL = batter ? toSvgX(-batter.zoneHalfWidth) : padding
  const zxR = batter ? toSvgX(batter.zoneHalfWidth)  : svgW - padding
  const zyT = batter ? toSvgY(batter.zoneTop, zoneMinY, zoneMaxY)    : padding
  const zyB = batter ? toSvgY(batter.zoneBottom, zoneMinY, zoneMaxY) : svgH - padding

  return (
    <div style={styles.panel}>
      {/* 진행 상황 */}
      <div style={styles.progress}>
        <div style={styles.pitchCounter}>
          <span style={styles.pitchNum}>{pitchCount}</span>
          <span style={styles.pitchTotal}>/{totalPitches}</span>
        </div>
        <div style={styles.batterCounter}>타자 {batterIndex + 1}/{totalBatters}</div>
      </div>

      <div style={styles.divider} />

      {/* 투수 폼 */}
      {pitcherForm && (
        <>
          <div style={styles.divider} />
          <div>
            <div style={styles.sectionLabel}>투수 폼</div>
            <div style={{
              ...styles.formChip,
              borderColor: FORM_COLOR[pitcherForm],
              color: FORM_COLOR[pitcherForm],
            }}>
              {FORM_LABEL[pitcherForm]}
            </div>
            <div style={styles.formClock}>{FORM_CLOCK[pitcherForm]} 방향</div>
            {pitcherLefty != null && (
              <div style={{
                ...styles.handChip,
                background: pitcherLefty
                  ? 'rgba(255,152,0,0.15)' : 'rgba(33,150,243,0.15)',
                borderColor: pitcherLefty ? '#ff9800' : '#2196f3',
                color: pitcherLefty ? '#ffb74d' : '#64b5f6',
              }}>
                {pitcherLefty ? '🤚 왼손' : '✋ 오른손'}
              </div>
            )}
          </div>
        </>
      )}

      {/* 타자 정보 */}
      {batter ? (
        <div style={styles.batterInfo}>
          <div style={styles.sectionLabel}>현재 타자</div>
          <div style={styles.chip}>{HEIGHT_LABEL[batter.height]}</div>
          <div style={styles.chip}>{BUILD_LABEL[batter.build]} 체형</div>
          <div style={styles.chip}>{STANCE_LABEL[batter.stance]} 스탠스</div>
          <div style={styles.chip}>{batter.isLefty ? '좌타자' : '우타자'}</div>
        </div>
      ) : (
        <div style={styles.sectionLabel}>타자 정보 없음</div>
      )}

      {/* 미니 SVG 존 */}
      <div style={styles.svgWrap}>
        <div style={styles.sectionLabel}>스트라이크존</div>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* 배경 */}
          <rect width={svgW} height={svgH} fill="rgba(0,0,0,0.4)" rx={4} />
          {/* 존 박스 */}
          <rect
            x={zxL} y={zyT}
            width={zxR - zxL} height={zyB - zyT}
            fill="rgba(0,220,255,0.18)"
            stroke="#00dcff"
            strokeWidth={1.5}
          />
          {/* 높이 레이블 */}
          {batter && (
            <>
              <text x={4} y={zyT + 4} fill="#9ecaf8" fontSize={9} dominantBaseline="hanging">
                {(batter.zoneTop * 100).toFixed(0)}cm
              </text>
              <text x={4} y={zyB - 2} fill="#9ecaf8" fontSize={9} dominantBaseline="auto">
                {(batter.zoneBottom * 100).toFixed(0)}cm
              </text>
            </>
          )}
          {/* 홈플레이트 선 */}
          <line
            x1={padding} y1={svgH - 6}
            x2={svgW - padding} y2={svgH - 6}
            stroke="#888" strokeWidth={1.5}
          />
        </svg>
      </div>

      {/* 멀티 순위 */}
      {multiRankings && multiRankings.length > 0 && (
        <>
          <div style={styles.divider} />
          <div style={styles.sectionLabel}>실시간 순위</div>
          <div style={styles.rankings}>
            {multiRankings
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((entry, i) => (
                <div
                  key={entry.uid}
                  style={{
                    ...styles.rankRow,
                    ...(entry.uid === myUid ? styles.rankRowMe : {}),
                  }}
                >
                  <span style={styles.rankNum}>{i + 1}</span>
                  <span style={styles.rankName}>
                    {entry.email.split('@')[0]}
                  </span>
                  <span style={styles.rankScore}>{entry.score.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: '50%',
    left: 12,
    transform: 'translateY(-50%)',
    width: 148,
    background: 'rgba(0,0,0,0.72)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: '12px 10px',
    color: '#fff',
    fontFamily: 'monospace',
    zIndex: 15,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progress: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  pitchCounter: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 2,
  },
  pitchNum: {
    fontSize: 28,
    fontWeight: 900,
    color: '#fff',
    lineHeight: 1,
  },
  pitchTotal: {
    fontSize: 14,
    color: '#888',
  },
  batterCounter: {
    fontSize: 11,
    color: '#9ecaf8',
    fontWeight: 600,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.12)',
    margin: '2px 0',
  },
  sectionLabel: {
    fontSize: 10,
    color: '#9ecaf8',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  formChip: {
    fontSize: 13,
    fontWeight: 800,
    border: '1px solid',
    borderRadius: 6,
    padding: '3px 8px',
    display: 'inline-block',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  formClock: {
    fontSize: 10,
    color: '#888',
    paddingLeft: 2,
  },
  handChip: {
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 5,
    padding: '2px 7px',
    display: 'inline-block',
    marginTop: 4,
  },
  batterInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  chip: {
    fontSize: 11,
    color: '#dde',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: '2px 6px',
  },
  svgWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
  },
  rankings: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    padding: '2px 4px',
    borderRadius: 4,
  },
  rankRowMe: {
    background: 'rgba(0,220,255,0.15)',
    color: '#00dcff',
  },
  rankNum: {
    width: 14,
    color: '#888',
    fontWeight: 700,
    textAlign: 'right',
  },
  rankName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rankScore: {
    fontWeight: 700,
    color: '#ffcc00',
    fontSize: 10,
  },
}
