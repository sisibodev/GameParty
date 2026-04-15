import { BatterProfile, PitchParams } from '../types'

interface Props {
  pitch: PitchParams
  batter: BatterProfile
  visible: boolean
}

// 2D 뷰 크기 (px)
const VIEW_W = 240
const VIEW_H = 290
const PADDING = 36

export default function StrikeZoneResult2D({ pitch, batter, visible }: Props) {
  if (!visible) return null

  // ── 좌표 매핑 ───────────────────────────────────────────────────────────
  const zoneW   = batter.zoneHalfWidth * 2
  const zoneH   = batter.zoneTop - batter.zoneBottom
  const rangeX  = batter.zoneHalfWidth * 1.7
  const rangeYb = -0.08
  const rangeYt = batter.zoneTop + zoneH * 0.45
  const rangeH  = rangeYt - rangeYb

  const drawW = VIEW_W - PADDING * 2
  const drawH = VIEW_H - PADDING * 2

  const toSvgX = (x: number) => PADDING + (x + rangeX) / (rangeX * 2) * drawW
  const toSvgY = (y: number) => PADDING + (1 - (y - rangeYb) / rangeH) * drawH

  const zoneX1 = toSvgX(-batter.zoneHalfWidth)
  const zoneX2 = toSvgX( batter.zoneHalfWidth)
  const zoneY1 = toSvgY(batter.zoneTop)
  const zoneY2 = toSvgY(batter.zoneBottom)

  // 공 위치 — 카메라가 뒤에서 보므로 X 반전
  const ballSvgX = toSvgX(-pitch.plateX)
  const ballSvgY = toSvgY(pitch.plateY)

  const isCorrect   = pitch.correct ?? false
  const isBorderline = pitch.isBorderline
  const ballColor   = isCorrect ? '#4caf50' : '#f44336'

  // 보더라인 영역
  const blMarginX = zoneW * 0.05
  const blMarginY = zoneH * 0.05
  const blX1 = toSvgX(-batter.zoneHalfWidth - blMarginX)
  const blX2 = toSvgX( batter.zoneHalfWidth + blMarginX)
  const blY1 = toSvgY(batter.zoneTop    + blMarginY)
  const blY2 = toSvgY(batter.zoneBottom - blMarginY)

  const callText = pitch.playerCall === 'strike' ? 'S' : 'B'
  const realText = pitch.isStrike ? '스트라이크' : '볼'

  // KBO ABS 3면 데이터
  const frontHit = pitch.frontPlaneHit
  const midHit   = pitch.midPlaneHit
  const endHit   = pitch.endPlaneHit
  const planeCount = pitch.planeHitCount ?? 0
  const hasPlaneData = frontHit !== undefined

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>투구 결과</div>

      <svg width={VIEW_W} height={VIEW_H} style={{ display: 'block' }}>
        {/* 보더라인 영역 */}
        <rect
          x={blX1} y={blY1}
          width={blX2 - blX1} height={blY2 - blY1}
          fill="rgba(255,200,0,0.07)"
          stroke="rgba(255,200,0,0.3)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* 홈플레이트 오각형 */}
        {(() => {
          const hw  = toSvgX(batter.zoneHalfWidth) - toSvgX(0)
          const cx  = VIEW_W / 2
          const top = toSvgY(0)
          const ph  = 13
          const ps  = 7
          const pts = [
            `${cx - hw},${top}`,
            `${cx + hw},${top}`,
            `${cx + hw},${top + ph}`,
            `${cx},${top + ph + ps}`,
            `${cx - hw},${top + ph}`,
          ].join(' ')
          return (
            <polygon
              points={pts}
              fill="rgba(255,255,255,0.9)"
              stroke="rgba(200,200,200,0.5)"
              strokeWidth={1}
            />
          )
        })()}

        {/* 스트라이크존 박스 */}
        <rect
          x={zoneX1} y={zoneY1}
          width={zoneX2 - zoneX1} height={zoneY2 - zoneY1}
          fill={pitch.isStrike ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'}
          stroke="#00e5ff"
          strokeWidth={2}
        />

        {/* 중심선 */}
        <line
          x1={(zoneX1 + zoneX2) / 2} y1={zoneY1}
          x2={(zoneX1 + zoneX2) / 2} y2={zoneY2}
          stroke="rgba(0,229,255,0.18)" strokeWidth={1}
        />
        <line
          x1={zoneX1} y1={(zoneY1 + zoneY2) / 2}
          x2={zoneX2} y2={(zoneY1 + zoneY2) / 2}
          stroke="rgba(0,229,255,0.18)" strokeWidth={1}
        />

        {/* 존 → 공 점선 */}
        <line
          x1={(zoneX1 + zoneX2) / 2}
          y1={(zoneY1 + zoneY2) / 2}
          x2={ballSvgX} y2={ballSvgY}
          stroke={ballColor}
          strokeWidth={1}
          strokeOpacity={0.35}
          strokeDasharray="3 3"
        />

        {/* 보더라인 강조 링 */}
        {isBorderline && (
          <circle cx={ballSvgX} cy={ballSvgY} r={14}
            fill="none" stroke="#ffcc00" strokeWidth={2} strokeOpacity={0.6} />
        )}

        {/* 공 */}
        <circle cx={ballSvgX} cy={ballSvgY} r={9}
          fill={ballColor} stroke="#fff" strokeWidth={1.5} opacity={0.95} />
        <text
          x={ballSvgX} y={ballSvgY + 1}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fontWeight="bold" fill="#fff"
        >
          {callText}
        </text>

        {/* 존 레이블 */}
        <text x={zoneX1 + 4} y={zoneY1 - 5}
          fontSize={9} fill="rgba(0,229,255,0.65)">ZONE</text>
      </svg>

      {/* 하단 결과 요약 */}
      <div style={styles.summary}>
        <div style={styles.row}>
          <span style={styles.label}>실제</span>
          <span style={{ ...styles.value, color: pitch.isStrike ? '#ff5722' : '#2196f3' }}>
            {realText}
          </span>
        </div>
        <div style={styles.sep} />
        <div style={styles.row}>
          <span style={styles.label}>나의 판정</span>
          <span style={{ ...styles.value, color: pitch.playerCall === 'strike' ? '#ff5722' : '#2196f3' }}>
            {pitch.playerCall === 'strike' ? '스트라이크' : '볼'}
          </span>
        </div>

        {/* KBO ABS 3면 통과 */}
        {hasPlaneData && (
          <>
            <div style={styles.sep} />
            <div style={styles.planesRow}>
              <PlaneChip label="앞" hit={frontHit!} />
              <PlaneChip label="중" hit={midHit!} />
              <PlaneChip label="끝" hit={endHit!} />
              <span style={{
                ...styles.planeCount,
                color: planeCount >= 2 ? '#ff5722' : '#2196f3',
              }}>
                {planeCount}/3면
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PlaneChip({ label, hit }: { label: string; hit: boolean }) {
  return (
    <div style={{
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 700,
      background: hit ? 'rgba(255,87,34,0.25)' : 'rgba(255,255,255,0.07)',
      border: `1px solid ${hit ? '#ff5722' : 'rgba(255,255,255,0.15)'}`,
      color: hit ? '#ff8a65' : '#666',
    }}>
      {label}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: 'rgba(8,15,28,0.92)',
    border: '1px solid rgba(0,229,255,0.25)',
    borderRadius: 14,
    padding: '10px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backdropFilter: 'blur(8px)',
    minWidth: VIEW_W + 28,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  title: {
    fontSize: 11,
    color: 'rgba(0,229,255,0.8)',
    fontWeight: 700,
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  summary: {
    marginTop: 8,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  value: {
    fontSize: 13,
    fontWeight: 700,
  },
  sep: {
    height: 1,
    background: 'rgba(255,255,255,0.07)',
  },
  planesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    justifyContent: 'center',
    paddingTop: 2,
  },
  planeCount: {
    fontSize: 12,
    fontWeight: 800,
    marginLeft: 4,
  },
}
