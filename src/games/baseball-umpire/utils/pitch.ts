import * as THREE from 'three'
import {
  PitchParams, PitchType, PitcherForm,
  DifficultyConfig, BatterProfile
} from '../types'
import { SeededRng } from './rng'

// 마운드에서 홈플레이트까지 거리 (18.44m)
export const MOUND_DISTANCE = 18.44

// 공 반지름 (MLB 규정: 지름 73~75mm → 반지름 0.037m)
export const BALL_RADIUS = 0.037

// 투구폼별 릴리즈 포인트 (마운드 기준, 오른손 투수 기준)
// x: 좌우 (+ = 1루측/우투수 팔 방향), y: 높이, z: 앞뒤 오프셋 (MOUND_DISTANCE에서 빼줌)
const RELEASE_POINT: Record<PitcherForm, { x: number; y: number; z: number }> = {
  overhand:      { x:  0.30, y: 1.85, z: 1.2 },  // 머리 위, 팔 약간 1루 방향
  three_quarter: { x:  0.55, y: 1.65, z: 1.0 },  // 귀 옆 대각선, 옆으로 더 벌어짐
  sidearm:       { x:  0.80, y: 1.25, z: 0.8 },  // 어깨 높이, 많이 옆으로 벌어짐
  underhand:     { x:  0.40, y: 0.85, z: 0.6 },  // 허리 아래, 약간 바깥쪽
}

// ── 변화구 풀 (직구 제외 전체 9종) ───────────────────────────────────────────
// 게임 시작 시 난이도별 breakingBallCount만큼 시드 RNG로 랜덤 선택
export const BREAKING_BALL_POOL: PitchType[] = [
  'two_seam', 'sinker', 'cutter',
  'changeup', 'slider', 'sweeper',
  'curve', 'splitter', 'forkball',
]

// ── 구종별 구속 배율 (직구 기준 상대 속도) ────────────────────────────────────
const PITCH_SPEED_RATIO: Record<PitchType, [number, number]> = {
  fastball: [0.97, 1.00],
  two_seam: [0.94, 0.98],
  sinker:   [0.92, 0.97],
  cutter:   [0.88, 0.93],
  changeup: [0.80, 0.87],
  slider:   [0.85, 0.91],
  sweeper:  [0.80, 0.86],
  curve:    [0.78, 0.85],
  splitter: [0.87, 0.93],
  forkball: [0.82, 0.88],
}

// ── 구종별 무브먼트 (방향성 적용, 우투수 기준) ────────────────────────────────
// xBase: 기준 횡 이동 (+= 포수시점 우/1루방향, -= 포수시점 좌/3루방향)
// xRange: 공마다 달라지는 ±변동폭
// yBase: 기준 수직 이동 (+= 상승, -= 낙하)
// yRange: ±변동폭
// forceDown: true → y 항상 음수 보장 (포크/싱커 등 낙하계)
// ※ 폼별 배율(FORM_MULT)과 ±15% 개인 편차(variety)가 추가 적용됨
interface DirectionalMovement {
  xBase: number; xRange: number
  yBase: number; yRange: number
  forceDown?: boolean
}
const PITCH_MOVEMENT: Record<PitchType, DirectionalMovement> = {
  //              xBase   xRange  yBase   yRange
  fastball: { xBase:  0.00, xRange: 0.05, yBase: +0.03, yRange: 0.03 },              // 백스핀 상승감
  two_seam: { xBase: +0.14, xRange: 0.04, yBase: -0.14, yRange: 0.04 },              // 1루방향 런+침하
  sinker:   { xBase: +0.18, xRange: 0.04, yBase: -0.24, yRange: 0.05, forceDown: true }, // 강한 런+침하
  cutter:   { xBase: -0.13, xRange: 0.04, yBase: -0.07, yRange: 0.03 },              // 3루방향 짧은 컷
  changeup: { xBase: +0.10, xRange: 0.05, yBase: -0.24, yRange: 0.06, forceDown: true }, // 암사이드+낙하
  slider:   { xBase: -0.16, xRange: 0.05, yBase: -0.20, yRange: 0.05 },              // 3루방향 횡변화+낙하
  sweeper:  { xBase: -0.12, xRange: 0.04, yBase: -0.10, yRange: 0.03 },              // 좌로 스윕
  curve:    { xBase: -0.12, xRange: 0.05, yBase: -0.44, yRange: 0.08 },              // 큰 낙차+약간 좌
  splitter: { xBase:  0.00, xRange: 0.06, yBase: -0.34, yRange: 0.07, forceDown: true }, // 직선 급강하
  forkball: { xBase:  0.00, xRange: 0.05, yBase: -0.44, yRange: 0.09, forceDown: true }, // 더 큰 낙차
}

// ── 투구폼별 무브먼트 배율 ──────────────────────────────────────────────────────
// 오버핸드: 수직 강조 / 사이드암: 수평 강조 / 언더핸드: 수평 극대화
const FORM_MULT: Record<PitcherForm, { x: number; y: number }> = {
  overhand:      { x: 0.75, y: 1.30 },
  three_quarter: { x: 1.00, y: 1.00 },
  sidearm:       { x: 1.20, y: 0.65 },
  underhand:     { x: 1.35, y: 0.50 },
}

// ── 구종별 베지어 궤적 파라미터 ───────────────────────────────────────────────
// t1/t2: 직선 경로 위 제어점 위치 (0=마운드, 1=홈플레이트)
// x1/x2: 직선 경로 대비 X 오프셋 (+= 1루/포수시점 오른쪽, -= 3루/포수시점 왼쪽)
// y1/y2: 직선 경로 대비 Y 오프셋 (+= 위, -= 아래)
// ※ 폼별 배율(FORM_BREAK_MULT)이 추가 적용됨
interface BreakProfile {
  t1: number; x1: number; y1: number   // 제어점1
  t2: number; x2: number; y2: number   // 제어점2
}
const PITCH_BREAK: Record<PitchType, BreakProfile> = {
  // 직구 ─ 백스핀 상승감, X 이탈 없음. y2=0으로 "위로 뜨는 버그" 방지
  fastball: { t1: 0.30, x1:  0.00, y1: +0.22,  t2: 0.70, x2:  0.00, y2:  0.00 },

  // 투심 ─ 암사이드(x+) 런: 비행 중 1루방향으로 흘러옴 + 후반 침하
  two_seam: { t1: 0.33, x1: +0.04, y1: +0.04,  t2: 0.72, x2: +0.07, y2: -0.12 },

  // 싱커 ─ 처음부터 암사이드, 상승 없이 강한 침하 (투심보다 낙차 명확히 큼)
  sinker:   { t1: 0.33, x1: +0.05, y1:  0.00,  t2: 0.73, x2: +0.08, y2: -0.25 },

  // 커터 ─ 직구처럼 진입 → 극후반 글러브사이드(x-)로 칼컷
  cutter:   { t1: 0.28, x1: -0.02, y1: +0.09,  t2: 0.84, x2: -0.08, y2: -0.05 },

  // 슬라이더 ─ ★초반 1루(x+)쪽 drift → 후반 3루(x-)방향으로 꺾임
  //            포수 시점: "바깥으로 빠졌다가 안으로 들어오는" 특성 구현
  slider:   { t1: 0.30, x1: +0.10, y1: +0.06,  t2: 0.76, x2: -0.06, y2: -0.12 },

  // 스위퍼 ─ 초반 직선 → 후반 3루(x-)방향 크게 스윕. 수직변화 작음 (x2 강화로 오버핸드에서도 스윕 명확)
  sweeper:  { t1: 0.28, x1:  0.00, y1: +0.02,  t2: 0.73, x2: -0.13, y2: -0.05 },

  // 체인지업 ─ 직구 위장(초반 약상승) → 암사이드로 낙하
  changeup: { t1: 0.33, x1: +0.03, y1: +0.08,  t2: 0.76, x2: +0.06, y2: -0.20 },

  // 커브 ─ ★y1=+0.34 × 오버핸드 배율 → ctrl1.y가 릴리즈 높이 초과 → 12-6 시각효과
  //         x2=-0.06: 오버핸드(-0.036) 미미 / 사이드암(-0.084) 글러브쪽 스윕 / 언더핸드(-0.066) 가로 커브
  curve:    { t1: 0.26, x1:  0.00, y1: +0.34,  t2: 0.65, x2: -0.06, y2: -0.28 },

  // 스플리터 ─ 직구와 동일 궤적으로 진입 → 극후반(86%) 갑작스러운 급락
  splitter: { t1: 0.35, x1:  0.00, y1:  0.00,  t2: 0.86, x2:  0.00, y2: -0.32 },

  // 포크볼 ─ 스플리터보다 더 큰 낙차 + 미세한 암사이드
  forkball: { t1: 0.35, x1: +0.02, y1:  0.00,  t2: 0.81, x2: +0.02, y2: -0.40 },
}

// ── 투구폼별 궤적 아크 배율 ───────────────────────────────────────────────────
// 오버핸드: 수직 아크 강조 / 사이드암·언더핸드: 수평 아크 강조
const FORM_BREAK_MULT: Record<PitcherForm, { x1: number; x2: number; y1: number; y2: number }> = {
  overhand:      { x1: 0.60, x2: 0.60, y1: 1.20, y2: 1.20 },
  three_quarter: { x1: 1.00, x2: 1.00, y1: 1.00, y2: 1.00 },
  sidearm:       { x1: 1.40, x2: 1.40, y1: 0.45, y2: 0.55 },
  // x1/x2: 1.60→1.10 (언더핸드 슬라이더·커터의 과장된 drift+cut 억제)
  // y1: 0.20→0.38 (직구 라이징 +8cm, 커브 솟음 +10cm로 아크 표현 개선)
  // y2: 0.35→0.55 (스플리터·포크볼 낙차 증가, 싱커·체인지업 침하 뚜렷해짐)
  underhand:     { x1: 1.10, x2: 1.10, y1: 0.38, y2: 0.55 },
}

// ── 관리자 런타임 오버라이드 ──────────────────────────────────────────────────
export interface DirectionalMovementExport {
  xBase: number; xRange: number
  yBase: number; yRange: number
  forceDown?: boolean
}
export interface BreakProfileExport {
  t1: number; x1: number; y1: number
  t2: number; x2: number; y2: number
}
export interface FullPitchConfig {
  pitchMovement:  Record<PitchType, DirectionalMovementExport>
  formMult:       Record<PitcherForm, { x: number; y: number }>
  pitchBreak:     Record<PitchType, BreakProfileExport>
  formBreakMult:  Record<PitcherForm, { x1: number; x2: number; y1: number; y2: number }>
}

let _configOverride: FullPitchConfig | null = null

/** 관리자 에디터에서 저장한 설정을 런타임에 적용 */
export function applyPitchConfig(config: FullPitchConfig) {
  _configOverride = config
}

/** 현재 기본값을 FullPitchConfig 형태로 반환 (에디터 초기값으로 사용) */
export function getDefaultPitchConfig(): FullPitchConfig {
  return {
    pitchMovement:  structuredClone(PITCH_MOVEMENT) as Record<PitchType, DirectionalMovementExport>,
    formMult:       structuredClone(FORM_MULT),
    pitchBreak:     structuredClone(PITCH_BREAK) as Record<PitchType, BreakProfileExport>,
    formBreakMult:  structuredClone(FORM_BREAK_MULT),
  }
}

/** 현재 활성 설정 반환 (오버라이드 있으면 오버라이드, 없으면 기본값) */
export function getActivePitchConfig(): FullPitchConfig {
  return _configOverride ?? getDefaultPitchConfig()
}

/** 보더라인 공: 존 경계 ±5% 이내에 의도적으로 위치 */
function borderlineX(rng: SeededRng, batter: BatterProfile): number {
  const side = rng.next() < 0.5 ? 1 : -1
  return batter.zoneHalfWidth * side + rng.float(-0.02, 0.02)
}

function borderlineY(rng: SeededRng, batter: BatterProfile): number {
  const edge = rng.next() < 0.5 ? 'top' : 'bottom'
  if (edge === 'top') return batter.zoneTop + rng.float(-0.03, 0.03)
  return batter.zoneBottom + rng.float(-0.03, 0.03)
}

export function generatePitch(
  rng: SeededRng,
  index: number,
  batter: BatterProfile,
  config: DifficultyConfig,
  pitchIndex: number,
  pitcherForm: PitcherForm,
  activePitchTypes: PitchType[],
): PitchParams {
  const pitchType = rng.pick(activePitchTypes)

  // 구종별 구속 계산
  const baseSpeed = rng.float(config.speedMin, config.speedMax)
  const speedRatio = rng.float(PITCH_SPEED_RATIO[pitchType][0], PITCH_SPEED_RATIO[pitchType][1])
  const speed = Math.min(Math.round(baseSpeed * speedRatio), 170)

  const isBorderline = rng.next() < config.borderlineRatio
  // 런타임 오버라이드 우선 적용
  const _pm = _configOverride?.pitchMovement ?? PITCH_MOVEMENT
  const _fm = _configOverride?.formMult      ?? FORM_MULT
  const mv = _pm[pitchType]
  const fm = _fm[pitcherForm]

  let plateX: number
  let plateY: number

  if (isBorderline) {
    plateX = borderlineX(rng, batter)
    plateY = borderlineY(rng, batter)
  } else {
    const shouldBeStrike = rng.next() < 0.5
    if (shouldBeStrike) {
      // 난이도 높을수록 존 중앙이 아닌 경계선 가까이에 배치
      plateX = rng.float(-batter.zoneHalfWidth * config.strikeZoneUsage, batter.zoneHalfWidth * config.strikeZoneUsage)
      // forceDown 구종은 하단 60% 이내를 타깃으로 (낙하계가 높은 공이 되지 않도록)
      if (mv.forceDown) {
        const maxY = batter.zoneBottom + (batter.zoneTop - batter.zoneBottom) * 0.6
        plateY = rng.float(batter.zoneBottom + 0.05, maxY)
      } else {
        const yMargin = (batter.zoneTop - batter.zoneBottom) * (1 - config.strikeZoneUsage) / 2
        plateY = rng.float(batter.zoneBottom + yMargin + 0.02, batter.zoneTop - yMargin - 0.02)
      }
    } else {
      // 난이도 높을수록 볼이 존 경계선 근처에만 배치
      // forceDown 구종(포크볼·싱커 등)은 위로 나가는 볼(dir=1) 미생성 → 상승 궤적 버그 방지
      let dir = rng.int(0, 4)
      if (dir === 1 && mv.forceDown) dir = 2   // 낙하계는 아래쪽 볼로 대체
      if (dir === 0) {
        plateX = batter.zoneHalfWidth + rng.float(config.ballMarginMin, config.ballMarginMax)
        if (rng.next() < 0.5) plateX = -plateX
        plateY = rng.float(batter.zoneBottom, batter.zoneTop)
      } else if (dir === 1) {
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneTop + rng.float(config.ballMarginMin, config.ballMarginMax)
      } else {
        plateX = rng.float(-batter.zoneHalfWidth * 1.2, batter.zoneHalfWidth * 1.2)
        plateY = batter.zoneBottom - rng.float(config.ballMarginMin, config.ballMarginMax)
      }
    }
  }

  // ── 무브먼트 계산 ─────────────────────────────────────────────────────────
  // ±15% 개인 편차: 같은 구종도 공마다 무브먼트가 조금씩 다름
  const variety = rng.float(0.85, 1.15)

  const rawMvX = (mv.xBase + rng.float(-mv.xRange, mv.xRange)) * fm.x * variety
  const rawMvY = (mv.yBase + rng.float(-mv.yRange, mv.yRange)) * fm.y * variety

  const mvX = rawMvX
  // forceDown 구종: 항상 낙하 방향 보장 (최소 -5cm 낙하)
  const mvY = mv.forceDown ? Math.min(rawMvY, -0.05) : rawMvY

  // 보더라인 공: 무브먼트를 추가하지 않고 존 경계선 위치 그대로 사용
  // 일반 공: 무브먼트 적용 후 존 경계 최대 0.28m 이내로 클램프 (너무 멀리 벗어나는 버그 방지)
  const MAX_OUT_X = batter.zoneHalfWidth + 0.28
  const MAX_OUT_Y_TOP = batter.zoneTop    + 0.25
  const MAX_OUT_Y_BOT = batter.zoneBottom - 0.25
  const rawFinalX = isBorderline ? plateX : plateX + mvX
  const rawFinalY = isBorderline ? plateY : plateY + mvY
  const finalPlateX = Math.max(-MAX_OUT_X, Math.min(MAX_OUT_X, rawFinalX))
  const finalPlateY = Math.max(MAX_OUT_Y_BOT, Math.min(MAX_OUT_Y_TOP, rawFinalY))

  // KBO ABS 3-plane 판정
  const frontHalfW = batter.zoneHalfWidth + 0.02
  const midHalfW   = batter.zoneHalfWidth + 0.02
  const endHalfW   = batter.zoneHalfWidth

  const frontPlaneHit =
    Math.abs(finalPlateX) <= frontHalfW + BALL_RADIUS &&
    finalPlateY >= batter.zoneBottom - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop    + BALL_RADIUS

  const midPlaneHit =
    Math.abs(finalPlateX) <= midHalfW + BALL_RADIUS &&
    finalPlateY >= batter.zoneBottom - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop    + BALL_RADIUS

  const endPlaneHit =
    Math.abs(finalPlateX) <= endHalfW + BALL_RADIUS &&
    finalPlateY >= (batter.zoneBottom - 0.015) - BALL_RADIUS &&
    finalPlateY <= batter.zoneTop + BALL_RADIUS

  // 2026 KBSA ABS 판정: 중간면(mid plane)에 스치기만 해도 스트라이크
  const isStrike = midPlaneHit

  void index

  return {
    pitchIndex,
    pitchType,
    pitcherForm,
    speed,
    plateX: finalPlateX,
    plateY: finalPlateY,
    isStrike,
    frontPlaneHit,
    midPlaneHit,
    endPlaneHit,
    isBorderline,
    playerCall: null,
    correct: undefined,
    scoreChange: undefined,
  }
}

/**
 * 구종별 고유 궤적 생성 (CubicBezierCurve3)
 *
 * 투구폼별 아크 배율(FORM_BREAK_MULT) 적용:
 *   - 오버핸드: 수직 아크 강조 (커브·스플리터 낙차 크게)
 *   - 사이드암: 수직 아크 감소 (횡 변화가 두드러지는 궤적)
 *   - 언더핸드: 수직 아크 최소 (거의 수평에 가까운 궤적)
 */
export function buildPitchCurve(
  params: PitchParams,
  form: PitcherForm,
): THREE.CubicBezierCurve3 {
  const rp = RELEASE_POINT[form]
  const bp = (_configOverride?.pitchBreak    ?? PITCH_BREAK)[params.pitchType]
  const fb = (_configOverride?.formBreakMult ?? FORM_BREAK_MULT)[form]

  const startZ = MOUND_DISTANCE - rp.z
  const start  = new THREE.Vector3(rp.x, rp.y, startZ)
  const end    = new THREE.Vector3(params.plateX, params.plateY, -0.30)

  const totalZ = startZ - (-0.30)
  const lerpOnLine = (t: number) => new THREE.Vector3(
    rp.x + (params.plateX - rp.x) * t,
    rp.y  + (params.plateY - rp.y) * t,
    startZ - totalZ * t,
  )

  const base1 = lerpOnLine(bp.t1)
  const base2 = lerpOnLine(bp.t2)

  // 폼별 배율로 X·Y 아크 조정
  // ?? 0 / ?? 1 : 구버전 Firestore 설정에 x1/x2 필드 없을 때 NaN 방지
  const ctrl1 = new THREE.Vector3(
    base1.x + (bp.x1 ?? 0) * (fb.x1 ?? 1),
    base1.y + bp.y1 * fb.y1,
    base1.z,
  )
  const ctrl2RawY = base2.y + bp.y2 * fb.y2
  // ctrl2.y 안전망: 하강 궤적(릴리즈 > 도달)에서만 클램프 적용
  // 상승 궤적(언더핸드 → 높은 타깃)에서 클램프하면 오히려 끝에서 튀어오르는 버그 유발
  const isDescending = rp.y > params.plateY
  const ctrl2Y = (isDescending && ctrl2RawY < params.plateY) ? params.plateY : ctrl2RawY
  const ctrl2 = new THREE.Vector3(
    base2.x + (bp.x2 ?? 0) * (fb.x2 ?? 1),
    ctrl2Y,
    base2.z,
  )

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end)
}

/**
 * 명시적 FullPitchConfig를 받아 베지어 커브 생성
 * 관리자 에디터 프리뷰 전용 — 모듈 레벨 override와 독립적으로 동작
 */
export function buildPitchCurveWithConfig(
  params: PitchParams,
  form: PitcherForm,
  config: FullPitchConfig,
): THREE.CubicBezierCurve3 {
  const rp  = RELEASE_POINT[form]
  const bp  = config.pitchBreak[params.pitchType]
  const fb  = config.formBreakMult[form]

  const startZ = MOUND_DISTANCE - rp.z
  const start  = new THREE.Vector3(rp.x, rp.y, startZ)
  const end    = new THREE.Vector3(params.plateX, params.plateY, -0.30)

  const totalZ = startZ - (-0.30)
  const lerpOnLine = (t: number) => new THREE.Vector3(
    rp.x + (params.plateX - rp.x) * t,
    rp.y  + (params.plateY - rp.y) * t,
    startZ - totalZ * t,
  )

  const base1 = lerpOnLine(bp.t1)
  const base2 = lerpOnLine(bp.t2)

  const ctrl1 = new THREE.Vector3(
    base1.x + (bp.x1 ?? 0) * (fb.x1 ?? 1),
    base1.y + bp.y1 * fb.y1,
    base1.z,
  )
  const ctrl2RawY = base2.y + bp.y2 * fb.y2
  const isDescending2 = rp.y > params.plateY
  const ctrl2Y2 = (isDescending2 && ctrl2RawY < params.plateY) ? params.plateY : ctrl2RawY
  const ctrl2 = new THREE.Vector3(
    base2.x + (bp.x2 ?? 0) * (fb.x2 ?? 1),
    ctrl2Y2,
    base2.z,
  )

  return new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end)
}

// ── 구종별 스핀/물리 파라미터 ──────────────────────────────────────────────────
interface SpinProfile { spinX: number; spinZ: number; drag: number }
const SPIN_PROFILE: Record<PitchType, SpinProfile> = {
  fastball: { spinX: +2400, spinZ:    0, drag: 0.32 },
  two_seam: { spinX: +1800, spinZ: +300, drag: 0.33 },
  sinker:   { spinX: +1200, spinZ: +500, drag: 0.34 },
  cutter:   { spinX: +2000, spinZ: -600, drag: 0.33 },
  changeup: { spinX: +1000, spinZ: +200, drag: 0.44 },
  slider:   { spinX:  +600, spinZ: -1800, drag: 0.35 },
  sweeper:  { spinX:  +200, spinZ: -2400, drag: 0.36 },
  curve:    { spinX: -2000, spinZ:  +400, drag: 0.38 },
  splitter: { spinX:  +400, spinZ:    0, drag: 0.40 },
  forkball: { spinX:  +200, spinZ:    0, drag: 0.42 },
}

const MAGNUS_COEFF = 0.00013
const GRAVITY      = 9.81
const BALL_MASS    = 0.145
const BALL_AREA    = Math.PI * 0.037 ** 2
const AIR_DENSITY  = 1.225

export function buildPhysicsCurve(
  params: PitchParams,
  form: PitcherForm = 'overhand',
): THREE.CatmullRomCurve3 {
  const rp    = RELEASE_POINT[form]
  const sp    = SPIN_PROFILE[params.pitchType]
  const v0    = params.speed / 3.6
  const startZ = MOUND_DISTANCE - rp.z

  const dx = params.plateX - rp.x
  const dy = params.plateY - rp.y
  const dz = -(startZ + 0.30)
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

  let vx = (dx / dist) * v0
  let vy = (dy / dist) * v0
  let vz = (dz / dist) * v0

  let px = rp.x
  let py = rp.y
  let pz = startZ

  const points: THREE.Vector3[] = [new THREE.Vector3(px, py, pz)]

  const omegaX = (sp.spinX / 60) * 2 * Math.PI
  const omegaZ = (sp.spinZ / 60) * 2 * Math.PI

  const N_STEPS  = 120
  const totalTime = (dist / v0) * 1.05
  const dt       = totalTime / N_STEPS

  for (let i = 0; i < N_STEPS; i++) {
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)

    const dragScale = 0.5 * sp.drag * AIR_DENSITY * BALL_AREA * speed / BALL_MASS
    const fdx = -dragScale * vx
    const fdy = -dragScale * vy
    const fdz = -dragScale * vz

    const magScale = MAGNUS_COEFF * (sp.spinX !== 0 || sp.spinZ !== 0 ? 1 : 0)
    const fmx = magScale * (omegaZ * vy)
    const fmy = magScale * (-omegaX * vz - omegaZ * vx)
    const fmz = magScale * (omegaX * vy)

    const ax = fdx + fmx
    const ay = fdy + fmy - GRAVITY
    const az = fdz + fmz

    vx += ax * dt
    vy += ay * dt
    vz += az * dt
    px += vx * dt
    py += vy * dt
    pz += vz * dt

    points.push(new THREE.Vector3(px, py, pz))
    if (pz <= -0.30) break
  }

  if (points.length > 1) {
    points[points.length - 1].set(params.plateX, params.plateY, -0.30)
  }

  return new THREE.CatmullRomCurve3(points)
}

/** km/h → 투구 비행 시간(ms) */
export function speedToFlightMs(speedKph: number): number {
  const mps = speedKph / 3.6
  return (MOUND_DISTANCE / mps) * 1000
}

/** 판정 점수 계산 */
export function calcScore(
  playerCall: 'strike' | 'ball',
  params: PitchParams,
  batter: BatterProfile,
  combo: number,
): { score: number; correct: boolean } {
  const correct = (playerCall === 'strike') === params.isStrike

  if (!correct) {
    const dX = Math.max(0, Math.abs(params.plateX) - batter.zoneHalfWidth)
    const dY = params.plateY < batter.zoneBottom
      ? batter.zoneBottom - params.plateY
      : params.plateY > batter.zoneTop
        ? params.plateY - batter.zoneTop
        : 0
    const dist = Math.sqrt(dX * dX + dY * dY)
    const normalized = Math.min(dist / 0.5, 1)
    const penalty = Math.round(5 + normalized * 95)
    return { score: -penalty, correct: false }
  }

  const base = params.isBorderline ? 150 : 100
  const multiplier = Math.min(1.0 + (combo - 1) * 0.1, 2.0)
  return { score: Math.round(base * multiplier), correct: true }
}
