import { BatterProfile, BatterHeight, BatterBuild, StanceHeight } from '../types'

const HEIGHT_LABEL: Record<BatterHeight, string>  = { short: '단신', medium: '보통', tall: '장신' }
const BUILD_LABEL: Record<BatterBuild, string>    = { slim: '마른체형', normal: '보통체형', stocky: '다부진체형' }
const STANCE_LABEL: Record<StanceHeight, string>  = { low: '낮은자세', mid: '일반자세', high: '높은자세' }

interface Props {
  batter: BatterProfile
  batterIndex: number
  totalBatters: number
  visible: boolean
}

export default function BatterIntro({ batter, batterIndex, totalBatters, visible }: Props) {
  if (!visible) return null

  const zoneH = (batter.zoneTop - batter.zoneBottom).toFixed(2)
  const zoneW = (batter.zoneHalfWidth * 2).toFixed(2)

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* 타자 번호 */}
        <div style={styles.header}>
          <span style={styles.num}>{batterIndex + 1}</span>
          <span style={styles.total}>/ {totalBatters}</span>
          <span style={styles.title}>타자 등장</span>
        </div>

        {/* 체형 정보 */}
        <div style={styles.traits}>
          <Chip label={HEIGHT_LABEL[batter.height]} color="#4fc3f7" />
          <Chip label={BUILD_LABEL[batter.build]} color="#81c784" />
          <Chip label={STANCE_LABEL[batter.stance]} color="#ffb74d" />
          {batter.isLefty && <Chip label="좌타" color="#ce93d8" />}
        </div>

        {/* 존 정보 */}
        <div style={styles.zoneInfo}>
          <ZoneBar label="존 높이" value={`${batter.zoneBottom.toFixed(2)}m ~ ${batter.zoneTop.toFixed(2)}m`} sub={`(${zoneH}m)`} />
          <ZoneBar label="존 너비" value={`${zoneW}m`} sub="(홈플레이트 폭)" />
        </div>

        {/* 미니 2D 존 */}
        <div style={styles.miniZoneWrap}>
          <MiniZone batter={batter} />
        </div>
      </div>
    </div>
  )
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ ...styles.chip, color, borderColor: color + '60', background: color + '18' }}>
      {label}
    </span>
  )
}

function ZoneBar({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={styles.zoneRow}>
      <span style={styles.zoneLabel}>{label}</span>
      <span style={styles.zoneValue}>{value}</span>
      <span style={styles.zoneSub}>{sub}</span>
    </div>
  )
}

function MiniZone({ batter }: { batter: BatterProfile }) {
  const W = 80, H = 90
  const pad = 14
  const drawW = W - pad * 2
  const drawH = H - pad * 2

  // 존을 최대 범위 1.1m ~ 0m 으로 정규화
  const rangeYb = 0
  const rangeYt = 1.2
  const rangeH  = rangeYt - rangeYb
  const rangeX  = batter.zoneHalfWidth * 1.6

  const toX = (x: number) => pad + (x + rangeX) / (rangeX * 2) * drawW
  const toY = (y: number) => pad + (1 - (y - rangeYb) / rangeH) * drawH

  const x1 = toX(-batter.zoneHalfWidth)
  const x2 = toX( batter.zoneHalfWidth)
  const y1 = toY(batter.zoneTop)
  const y2 = toY(batter.zoneBottom)

  return (
    <svg width={W} height={H}>
      <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0)" />
      {/* 스트라이크존 */}
      <rect
        x={x1} y={y1} width={x2 - x1} height={y2 - y1}
        fill="rgba(0,229,255,0.12)"
        stroke="#00e5ff"
        strokeWidth={1.5}
      />
      {/* 홈플레이트 간략 표현 */}
      <rect
        x={toX(-batter.zoneHalfWidth)} y={toY(0) - 3}
        width={x2 - x1} height={5}
        fill="rgba(255,255,255,0.7)"
        rx={1}
      />
      {/* 높이 레이블 */}
      <text x={x1 - 2} y={y1 + 1} fontSize={6} fill="#00e5ff" textAnchor="end">{batter.zoneTop.toFixed(1)}</text>
      <text x={x1 - 2} y={y2 + 4} fontSize={6} fill="#00e5ff" textAnchor="end">{batter.zoneBottom.toFixed(1)}</text>
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 35,
    pointerEvents: 'none',
    animation: 'fadeInOut 0.3s ease',
  },
  card: {
    background: 'rgba(10,18,35,0.93)',
    border: '1px solid rgba(0,229,255,0.45)',
    borderRadius: 16,
    padding: '16px 20px',
    color: '#fff',
    fontFamily: 'sans-serif',
    minWidth: 240,
    backdropFilter: 'blur(10px)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 5,
    marginBottom: 12,
  },
  num: { fontSize: 32, fontWeight: 900, color: '#00e5ff', lineHeight: 1 },
  total: { fontSize: 14, color: '#aaa' },
  title: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginLeft: 4 },
  traits: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 12,
  },
  chip: {
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 20,
    padding: '2px 9px',
  },
  zoneInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 10,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  zoneRow: { display: 'flex', alignItems: 'center', gap: 6 },
  zoneLabel: { fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 52 },
  zoneValue: { fontSize: 12, fontWeight: 700, color: '#fff' },
  zoneSub:   { fontSize: 10, color: '#777' },
  miniZoneWrap: { display: 'flex', justifyContent: 'center', marginTop: 2 },
}
