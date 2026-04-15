// ─── 구종 ───────────────────────────────────────────────────────────────────
export type PitchType =
  | 'fastball'
  | 'two_seam'
  | 'changeup'
  | 'slider'
  | 'curve'
  | 'splitter'

// ─── 투구폼 ──────────────────────────────────────────────────────────────────
export type PitcherForm = 'overhand' | 'three_quarter' | 'sidearm' | 'underhand'

// ─── 타자 체형 ────────────────────────────────────────────────────────────────
export type BatterHeight = 'short' | 'medium' | 'tall'
export type BatterBuild  = 'slim'  | 'normal' | 'stocky'
export type StanceHeight = 'low'   | 'mid'    | 'high'

export interface BatterProfile {
  index: number
  height: BatterHeight
  build: BatterBuild
  stance: StanceHeight
  isLefty: boolean
  /** 스트라이크존 하단 Y (Three.js 단위) */
  zoneBottom: number
  /** 스트라이크존 상단 Y */
  zoneTop: number
  /** 스트라이크존 너비 (홈플레이트 기준 ±half) */
  zoneHalfWidth: number
}

// ─── 난이도 ──────────────────────────────────────────────────────────────────
export type Difficulty = 'rookie' | 'amateur' | 'pro' | 'major'

export interface DifficultyConfig {
  label: string
  speedMin: number   // km/h
  speedMax: number
  pitchTypes: PitchType[]
  borderlineRatio: number  // 0~1
}

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  rookie: {
    label: '루키',
    speedMin: 80, speedMax: 100,
    pitchTypes: ['fastball', 'changeup'],
    borderlineRatio: 0.1,
  },
  amateur: {
    label: '아마추어',
    speedMin: 100, speedMax: 120,
    pitchTypes: ['fastball', 'two_seam', 'changeup', 'slider'],
    borderlineRatio: 0.2,
  },
  pro: {
    label: '프로',
    speedMin: 120, speedMax: 140,
    pitchTypes: ['fastball', 'two_seam', 'changeup', 'slider', 'curve'],
    borderlineRatio: 0.35,
  },
  major: {
    label: '메이저',
    speedMin: 140, speedMax: 150,
    pitchTypes: ['fastball', 'two_seam', 'changeup', 'slider', 'curve', 'splitter'],
    borderlineRatio: 0.5,
  },
}

// ─── 투구 파라미터 ────────────────────────────────────────────────────────────
export interface PitchParams {
  pitchIndex: number
  pitchType: PitchType
  pitcherForm: PitcherForm
  speed: number        // km/h
  /** 홈플레이트 통과 X 좌표 (중앙=0, 우+=투수 오른쪽) */
  plateX: number
  /** 홈플레이트 통과 Y 좌표 (바닥=0) */
  plateY: number
  /** 실제 스트라이크 여부 (3-plane ABS 기준) */
  isStrike: boolean
  /** KBO ABS 3면 통과 여부 */
  frontPlaneHit?: boolean
  midPlaneHit?: boolean
  endPlaneHit?: boolean
  planeHitCount?: number
  /** 플레이어 판정 결과 */
  playerCall?: 'strike' | 'ball' | null
  correct?: boolean
  scoreChange?: number
  /** 보더라인 판정 여부 */
  isBorderline?: boolean
}

// ─── 게임 모드 ────────────────────────────────────────────────────────────────
export type GameMode = 'practice' | 'normal'

// ─── 판정 결과 피드백 ─────────────────────────────────────────────────────────
export interface JudgmentFeedback {
  type: 'correct' | 'wrong' | 'borderline' | 'timeout'
  call: 'strike' | 'ball'
  correct: boolean
  scoreChange: number
  isBorderline: boolean
  pitchType: PitchType
  speed: number
}

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
export type GamePhase =
  | 'mode_select'
  | 'difficulty_select'
  | 'playing'
  | 'result'

export interface GameState {
  phase: GamePhase
  mode: GameMode | null
  difficulty: Difficulty | null
  batters: BatterProfile[]
  currentBatterIndex: number
  pitchCount: number
  score: number
  combo: number
  totalPitches: number
  correctCount: number
  pitchHistory: PitchParams[]
  currentPitch: PitchParams | null
}

// ─── 투구 단계 ────────────────────────────────────────────────────────────────
export type PitchPhase =
  | 'idle'        // 대기
  | 'wind_up'     // 와인드업
  | 'in_flight'   // 비행 중
  | 'arrived'     // 도착
  | 'judging'     // 판정 입력 대기 (3초)
  | 'feedback'    // 판정 결과 표시
  | 'next'        // 다음 투구 대기
