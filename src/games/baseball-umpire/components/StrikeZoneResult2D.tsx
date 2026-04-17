import { BatterProfile, PitchParams } from '../types'

interface Props {
  pitch: PitchParams
  batter: BatterProfile
  visible: boolean
}

// 공 + 마진 포함 전체 SVG 가시 영역 (px)
const PADDING = 32    // 존 바깥 마진
const ZONE_W  = 160   // 전체 가시 영역 픽셀 너비 (존 + 마진 포함)

export default function StrikeZoneResult2D({ pitch, batter, visible }: Props) {
  if (!visible) return null

  // ── 타자 체형 기반 실제 종횡비 ───────────────────────────────────────────
  const zoneW = batter.zoneHalfWidth * 2           // 실제 존 너비 (Three.js 단위)
  const zoneH = batter.zoneTop - batter.zoneBottom // 실제 존 높이

  // ZONE_W 는 공이 벗어났을 때도 볼 수 있는 전체 가시 범위 픽셀 너비
  // 높이는 종횡비로 결정
  const ZONE_H = ZONE_W * (zoneH / zoneW)

  // 전체 SVG 크기 (상하 PADDING 포함)
  const SVG_W = ZONE_W + PADDING * 2
  const SVG_H = ZONE_H + PADDING * 2 + 28  // 홈플레이트 공간 추가

  // ── 존 밖 공 가시 범위 (Three.js 단위) ──────────────────────────────────
  const marginX = zoneW * 0.55
  const marginY = zoneH * 0.30
  const rangeX  = batter.zoneHalfWidth + marginX     // 좌우 최대 표시 범위
  const rangeYb = batter.zoneBottom - marginY         // 하단 최대 표시 범위
  const rangeYt = batter.zoneTop    + marginY         // 상단 최대 표시 범위
  const rangeH  = rangeYt - rangeYb

  // ── 좌표 → SVG 픽셀 변환 (공 위치와 존 박스 모두 이 함수 사용) ──────────
  const toSvgX = (x: number) =>
    PADDING + ((x + rangeX) / (rangeX * 2)) * ZONE_W
  const toSvgY = (y: number) =>
    PADDING + (1 - (y - rangeYb) / rangeH) * ZONE_H

  // ── 실제 스트라이크 존 박스 SVG 좌표 (판정 로직과 동일한 좌표계) ─────────
  const zoneX1 = toSvgX(-batter.zoneHalfWidth)  // 왼쪽 경계
  const zoneX2 = toSvgX(+batter.zoneHalfWidth)  // 오른쪽 경계
  const zoneY1 = toSvgY(batter.zoneTop)          // 상단 경계 (SVG y: 위가 작음)
  const zoneY2 = toSvgY(batter.zoneBottom)       // 하단 경계

  const zoneCx = (zoneX1 + zoneX2) / 2
  const zoneCy = (zoneY1 + zoneY2) / 2

  // ── 공 위치 (카메라가 뒤에서 보므로 X 반전) ──────────────────────────────
  const ballSvgX = toSvgX(-pitch.plateX)
  const ballSvgY = toSvgY(pitch.plateY)

  const isCorrect    = pitch.correct ?? false
  const isBorderline = pitch.isBorderline
  const ballColor    = isCorrect ? '#4caf50' : '#f44336'
  const callText     = pitch.playerCall === 'strike' ? 'S' : 'B'
  const realText     = pitch.isStrike ? '스트라이크' : '볼'

  // KBO ABS 3면 데이터
  const frontHit    = pitch.frontPlaneHit
  const midHit      = pitch.midPlaneHit
  const endHit      = pitch.endPlaneHit
  const planeCount  = [frontHit, midHit, endHit].filter(Boolean).length
  const hasPlaneData = frontHit !== undefined

  // 홈플레이트 (존 하단과 8px 간격)
  const plateTop = zoneY2 + 24
  const plateHw  = (zoneX2 - zoneX1) / 2
  const platePh  = 10
  const platePs  = 6
  const platePts = [
    `${zoneCx - plateHw},${plateTop}`,
    `${zoneCx + plateHw},${plateTop}`,
    `${zoneCx + plateHw},${plateTop + platePh}`,
    `${zoneCx},${plateTop + platePh + platePs}`,
    `${zoneCx - plateHw},${plateTop + platePh}`,
  ].join(' ')

  return (
    <div style={{ ...styles.wrap, minWidth: SVG_W }}>
      <div style={styles.title}>투구 결과</div>

      <svg width={SVG_W} height={Math.round(SVG_H)} style={{ display: 'block' }}>
        {/* 홈플레이트 오각형 */}
        <polygon
          points={platePts}
          fill="rgba(255,255,255,0.9)"
          stroke="rgba(200,200,200,0.5)"
          strokeWidth={1}
        />

        {/* 실제 스트라이크 존 박스 */}
        <rect
          x={zoneX1} y={zoneY1}
          width={zoneX2 - zoneX1} height={zoneY2 - zoneY1}
          fill={pitch.isStrike ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'}
          stroke={isBorderline ? '#ffcc00' : '#00e5ff'}
          strokeWidth={2}
          strokeDasharray={isBorderline ? '6 3' : undefined}
        />

        {/* 중심선 (존 내부만) */}
        <line
          x1={zoneCx} y1={zoneY1}
          x2={zoneCx} y2={zoneY2}
          stroke="rgba(0,229,255,0.2)" strokeWidth={1}
        />
        <line
          x1={zoneX1} y1={zoneCy}
          x2={zoneX2} y2={zoneCy}
          stroke="rgba(0,229,255,0.2)" strokeWidth={1}
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
        <text x={zoneX1} y={zoneY1 - 6}
          fontSize={9} fill="rgba(0,229,255,0.65)">ZONE</text>
      </svg>

      {/* 하단 결과 요약 */}
      <div style={{ ...styles.summary, width: SVG_W - 28 }}>
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
                color: midHit ? '#ff5722' : '#2196f3',
              }}>
                중간면 {midHit ? '통과' : '미통과'}
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
