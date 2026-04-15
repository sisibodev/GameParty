import { BatterProfile, PitchParams } from '../types'

interface Props {
  pitch: PitchParams
  batter: BatterProfile
  visible: boolean
}

// 2D 뷰 크기 (px)
const VIEW_W = 220
const VIEW_H = 300
const PADDING = 36   // 존 바깥 여백

export default function StrikeZoneResult2D({ pitch, batter, visible }: Props) {
  if (!visible) return null

  // ── 좌표 매핑 계산 ──────────────────────────────────────────────────────
  const zoneW  = batter.zoneHalfWidth * 2
  const zoneH  = batter.zoneTop - batter.zoneBottom

  const rangeX  = batter.zoneHalfWidth * 1.7
  const rangeYb = -0.08                         // 홈플레이트(Y=0) 아래까지 포함
  const rangeYt = batter.zoneTop + zoneH * 0.45
  const rangeH  = rangeYt - rangeYb

  const drawW = VIEW_W - PADDING * 2
  const drawH = VIEW_H - PADDING * 2

  const toSvgX = (x: number) => PADDING + (x + rangeX) / (rangeX * 2) * drawW
  const toSvgY = (y: number) => PADDING + (1 - (y - rangeYb) / rangeH) * drawH

  // 존 박스 좌표
  const zoneX1 = toSvgX(-batter.zoneHalfWidth)
  const zoneX2 = toSvgX( batter.zoneHalfWidth)
  const zoneY1 = toSvgY(batter.zoneTop)
  const zoneY2 = toSvgY(batter.zoneBottom)

  // 공 위치 — 카메라가 홈플레이트 뒤에서 마운드를 바라보므로 X 반전
  const ballSvgX = toSvgX(-pitch.plateX)
  const ballSvgY = toSvgY(pitch.plateY)

  // 색상
  const isCorrect = pitch.correct ?? false
  const ballColor = isCorrect ? '#4caf50' : '#f44336'
  const isBorderline = pitch.isBorderline

  // 보더라인 영역 (존 ±5%)
  const blMarginX = zoneW * 0.05
  const blMarginY = zoneH * 0.05
  const blX1 = toSvgX(-batter.zoneHalfWidth - blMarginX)
  const blX2 = toSvgX( batter.zoneHalfWidth + blMarginX)
  const blY1 = toSvgY(batter.zoneTop    + blMarginY)
  const blY2 = toSvgY(batter.zoneBottom - blMarginY)

  const callText  = pitch.playerCall === 'strike' ? 'S' : 'B'
  const realText  = pitch.isStrike ? '스트라이크' : '볼'

  return (
    <div style={styles.wrap}>
      {/* 타이틀 */}
      <div style={styles.title}>투구 위치</div>

      <svg
        width={VIEW_W}
        height={VIEW_H}
        style={{ display: 'block' }}
      >
        {/* 배경 */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H}
          fill="rgba(0,0,0,0)" />

        {/* 보더라인 영역 */}
        <rect
          x={blX1} y={blY1}
          width={blX2 - blX1} height={blY2 - blY1}
          fill="rgba(255,200,0,0.08)"
          stroke="rgba(255,200,0,0.35)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* 홈플레이트 (오각형, 실제 비율 반영) */}
        {(() => {
          const hw  = toSvgX(batter.zoneHalfWidth)  - toSvgX(0)  // SVG 상의 반폭
          const cx  = VIEW_W / 2
          const top = toSvgY(0)       // 플레이트 상단 Y
          const ph  = 14              // 플레이트 높이 (픽셀)
          const ps  = 8               // 하단 꼭지점까지 추가 거리
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
              fill="rgba(255,255,255,0.92)"
              stroke="rgba(200,200,200,0.6)"
              strokeWidth={1}
            />
          )
        })()}

        {/* 스트라이크존 박스 */}
        <rect
          x={zoneX1} y={zoneY1}
          width={zoneX2 - zoneX1} height={zoneY2 - zoneY1}
          fill={pitch.isStrike ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'}
          stroke="#00e5ff"
          strokeWidth={2}
        />

        {/* 존 가로/세로 중심선 */}
        <line
          x1={(zoneX1 + zoneX2) / 2} y1={zoneY1}
          x2={(zoneX1 + zoneX2) / 2} y2={zoneY2}
          stroke="rgba(0,229,255,0.2)" strokeWidth={1}
        />
        <line
          x1={zoneX1} y1={(zoneY1 + zoneY2) / 2}
          x2={zoneX2} y2={(zoneY1 + zoneY2) / 2}
          stroke="rgba(0,229,255,0.2)" strokeWidth={1}
        />

        {/* 공 궤적 점선 (중앙에서 공 위치까지) */}
        <line
          x1={(zoneX1 + zoneX2) / 2}
          y1={(zoneY1 + zoneY2) / 2}
          x2={ballSvgX} y2={ballSvgY}
          stroke={ballColor}
          strokeWidth={1}
          strokeOpacity={0.4}
          strokeDasharray="3 3"
        />

        {/* 공 위치 외부 링 (보더라인 강조) */}
        {isBorderline && (
          <circle
            cx={ballSvgX} cy={ballSvgY} r={13}
            fill="none"
            stroke="#ffcc00"
            strokeWidth={2}
            strokeOpacity={0.7}
          />
        )}

        {/* 공 */}
        <circle
          cx={ballSvgX} cy={ballSvgY} r={8}
          fill={ballColor}
          stroke="#fff"
          strokeWidth={1.5}
          opacity={0.95}
        />

        {/* 공 위에 판정 텍스트 */}
        <text
          x={ballSvgX} y={ballSvgY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight="bold"
          fill="#fff"
        >
          {callText}
        </text>

        {/* 존 레이블 */}
        <text x={zoneX1 + 4} y={zoneY1 - 5}
          fontSize={9} fill="rgba(0,229,255,0.7)">
          ZONE
        </text>

        {/* 좌우 레이블 */}
        <text x={PADDING / 2} y={VIEW_H - 8}
          fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">안쪽</text>
        <text x={VIEW_W - PADDING / 2} y={VIEW_H - 8}
          fontSize={9} fill="rgba(255,255,255,0.3)" textAnchor="middle">바깥</text>
      </svg>

      {/* 하단 결과 요약 */}
      <div style={styles.summary}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>실제</span>
          <span style={{
            ...styles.summaryValue,
            color: pitch.isStrike ? '#ff5722' : '#2196f3'
          }}>
            {realText}
          </span>
        </div>
        <div style={styles.divider} />
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>나의 판정</span>
          <span style={{
            ...styles.summaryValue,
            color: pitch.playerCall === 'strike' ? '#ff5722' : '#2196f3'
          }}>
            {pitch.playerCall === 'strike' ? '스트라이크' : '볼'}
          </span>
        </div>
        <div style={styles.divider} />
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>오차</span>
          <span style={{ ...styles.summaryValue, color: '#ccc', fontSize: 11 }}>
            X {pitch.plateX.toFixed(2)}m &nbsp; Y {pitch.plateY.toFixed(2)}m
          </span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: 'rgba(10,18,35,0.88)',
    border: '1px solid rgba(0,229,255,0.3)',
    borderRadius: 14,
    padding: '10px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backdropFilter: 'blur(6px)',
    minWidth: VIEW_W + 28,
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
    gap: 4,
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.07)',
  },
}
