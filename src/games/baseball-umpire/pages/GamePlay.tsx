import { useEffect, useRef, useState, useCallback } from 'react'
import {
  BatterProfile, Difficulty, GameMode, JudgmentFeedback,
  PitchParams, PitchPhase, PitcherForm, PitchType, TrajectoryMode, DIFFICULTY_CONFIG,
} from '../types'
import { SeededRng, randomSeed } from '../utils/rng'
import { generateBatters } from '../utils/batter'
import { generatePitch, calcScore, BREAKING_BALL_POOL } from '../utils/pitch'
import BaseballScene from '../components/BaseballScene'
import HUD from '../components/HUD'
import LeftPanel from '../components/LeftPanel'
import JudgmentFeedbackUI from '../components/JudgmentFeedback'
import PitchKey from '../components/PitchKey'
import PitchReplayList from '../components/PitchReplayList'
import ReplayControls from '../components/ReplayControls'
import StrikeZoneResult2D from '../components/StrikeZoneResult2D'
import { playMittSound } from '../utils/sound'

const TOTAL_BATTERS      = 6
const PITCHES_PER_BATTER = 5
const TOTAL_PITCHES      = TOTAL_BATTERS * PITCHES_PER_BATTER  // 30
const JUDGMENT_TIMEOUT   = 3000

const PITCHER_FORMS: PitcherForm[] = ['overhand', 'three_quarter', 'sidearm', 'underhand']

interface MultiRankEntry {
  uid: string
  email: string
  score: number
}

interface Props {
  mode: GameMode
  difficulty: Difficulty
  trajectoryMode?: TrajectoryMode   // 궤적 방식 (기본: 'bezier')
  initialSeed?: number   // 멀티 모드: 공통 시드 고정
  multiRankings?: MultiRankEntry[]
  myUid?: string
  onScoreUpdate?: (score: number) => void   // 멀티: 판정마다 점수 실시간 전송
  onGameEnd: (result: {
    score: number
    totalPitches: number
    correctCount: number
    maxCombo: number
    pitchHistory: PitchParams[]
  }) => void
  onBack: () => void
}

export default function GamePlay({
  mode, difficulty, trajectoryMode = 'bezier', initialSeed, multiRankings, myUid,
  onScoreUpdate, onGameEnd, onBack,
}: Props) {
  const config = DIFFICULTY_CONFIG[difficulty]

  // ── React state (UI 렌더용) ───────────────────────────────────────────────
  const [batterIndex, setBatterIndex]     = useState(0)
  const [pitchCount, setPitchCount]       = useState(1)  // 1-based, for HUD display
  const [score, setScore]                 = useState(0)
  const [combo, setCombo]                 = useState(0)
  const [pitchHistory, setPitchHistory]   = useState<PitchParams[]>([])
  const [pitchPhase, setPitchPhase]       = useState<PitchPhase>('idle')
  const [currentPitch, setCurrentPitch]   = useState<PitchParams | null>(null)
  const [showZone, setShowZone]           = useState(mode === 'practice')
  const [feedback, setFeedback]           = useState<JudgmentFeedback | null>(null)
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const [countdown, setCountdown]         = useState(3)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 리플레이
  const [replayPitch, setReplayPitch]     = useState<PitchParams | null>(null)
  const [replaySpeed, setReplaySpeed]     = useState(1)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replayStage, setReplayStage]     = useState(1)
  const [replayStageOverride, setReplayStageOverride] = useState<number | undefined>(undefined)

  // ── Refs (stale closure 방지용 최신값 저장) ──────────────────────────────
  const rngRef            = useRef<SeededRng>(new SeededRng(initialSeed ?? randomSeed()))
  const battersRef        = useRef<BatterProfile[]>([])
  const pitcherFormsRef   = useRef<PitcherForm[]>([])   // 3 forms for 10-pitch segments
  const activePitchTypesRef = useRef<PitchType[]>(['fastball'])  // 이번 게임 사용 구종
  const judgeTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const advanceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)  // 판정 후 2s 진행 타이머
  const nextPitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)  // 다음 투구 대기 타이머
  const windupTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)  // 와인드업 1.2s 타이머
  const pitchIndexRef     = useRef(0)   // global pitch index (0-29)
  const pitchInBatterRef  = useRef(0)   // pitches thrown to current batter (0-4)

  // 리플레이 일시정지 관련
  const isReplayActiveRef          = useRef(false)
  const replayPausePhaseRef        = useRef<PitchPhase>('idle')
  const replayPauseBidxRef         = useRef(0)
  const ballArrivedDuringReplayRef = useRef(false)

  // 게임 상태 최신값 ref
  const batterIndexRef  = useRef(0)
  const scoreRef        = useRef(0)
  const comboRef        = useRef(0)
  const maxComboRef     = useRef(0)
  const totalPitchesRef = useRef(0)
  const correctCountRef = useRef(0)
  const pitchHistoryRef = useRef<PitchParams[]>([])
  const currentPitchRef = useRef<PitchParams | null>(null)
  const pitchPhaseRef   = useRef<PitchPhase>('idle')

  // ── state setter + ref 동기화 헬퍼 ──────────────────────────────────────
  const setAndRefPitchPhase = (p: PitchPhase) => {
    pitchPhaseRef.current = p
    setPitchPhase(p)
  }

  // ── 초기화 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const rng = new SeededRng(initialSeed ?? randomSeed())
    rngRef.current = rng
    battersRef.current = generateBatters(rng, TOTAL_BATTERS)
    // 10구 단위 3개 세그먼트 투구폼 미리 결정 (RNG 시퀀스 유지)
    pitcherFormsRef.current = [
      rng.pick(PITCHER_FORMS),
      rng.pick(PITCHER_FORMS),
      rng.pick(PITCHER_FORMS),
    ]
    // 변화구 풀에서 breakingBallCount개 랜덤 선택 (부분 Fisher-Yates)
    // 멀티플레이: 동일 시드 → 모든 플레이어가 같은 구종 조합
    const pool = [...BREAKING_BALL_POOL]
    const n = config.breakingBallCount
    for (let i = 0; i < n; i++) {
      const j = rng.int(i, pool.length)
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    activePitchTypesRef.current = ['fastball' as PitchType, ...pool.slice(0, n)]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 존 잠깐 표시 (투구 전) ───────────────────────────────────────────────
  const showZoneTemporarily = useCallback(() => {
    if (mode === 'practice') return   // 연습 모드는 항상 표시
    setShowZone(true)
    setTimeout(() => setShowZone(false), config.zoneShowTime)
  }, [mode, config.zoneShowTime])

  // ── 다음 투구 시작 ───────────────────────────────────────────────────────
  const startNextPitch = useCallback((bidx: number) => {
    const batter = battersRef.current[bidx]
    if (!batter) return

    showZoneTemporarily()
    setAndRefPitchPhase('wind_up')

    windupTimerRef.current = setTimeout(() => {
      // 타자 2명마다 구속 10km/h 증가 (0,1→+0 / 2,3→+10 / 4,5→+20)
      const speedBonus = Math.floor(bidx / 2) * 10
      const boostedConfig = {
        ...config,
        speedMin: config.speedMin + speedBonus,
        speedMax: config.speedMax + speedBonus,
      }

      // 10구마다 폼 변경 (세그먼트: 0~9, 10~19, 20~29)
      const segment = Math.min(Math.floor(pitchIndexRef.current / 10), 2)
      const form = pitcherFormsRef.current[segment] ?? 'overhand'

      const pitch = generatePitch(
        rngRef.current, bidx, batter, boostedConfig, pitchIndexRef.current++, form,
        activePitchTypesRef.current,
      )
      currentPitchRef.current = pitch
      setCurrentPitch(pitch)
      setPitchCount(pitchIndexRef.current)  // 방금 증가된 인덱스 = 1-based count
      setAndRefPitchPhase('in_flight')
    }, 1200)
  }, [config, showZoneTemporarily])

  // ── 게임 진행 헬퍼 (ref 패턴으로 stale closure 방지) ─────────────────────

  // 판정 후 게임 진행 (advance timer에서 호출)
  const doAdvanceRef = useRef<(bidx: number, latestScore: number) => void>(() => {})
  doAdvanceRef.current = (bidx: number, latestScore: number) => {
    setFeedback(null)
    setAndRefPitchPhase('next')

    if (pitchInBatterRef.current >= PITCHES_PER_BATTER) {
      const nextBidx = bidx + 1
      pitchInBatterRef.current = 0

      if (nextBidx >= TOTAL_BATTERS) {
        onGameEnd({
          score: latestScore,
          totalPitches: totalPitchesRef.current,
          correctCount: correctCountRef.current,
          maxCombo: maxComboRef.current,
          pitchHistory: pitchHistoryRef.current,
        })
      } else {
        batterIndexRef.current = nextBidx
        setBatterIndex(nextBidx)
        nextPitchTimerRef.current = setTimeout(() => startNextPitch(nextBidx), 1500)
      }
    } else {
      nextPitchTimerRef.current = setTimeout(() => startNextPitch(bidx), 1200)
    }
  }

  // 판정 타이머 시작 (판정 단계 진입 시 호출)
  const startJudgingRef = useRef<() => void>(() => {})
  startJudgingRef.current = () => {
    setCountdown(3)
    let count = 3
    countdownRef.current = setInterval(() => {
      count--
      setCountdown(count)
      if (count <= 0) clearInterval(countdownRef.current!)
    }, 1000)
    judgeTimerRef.current = setTimeout(() => {
      judgeRef.current(null)
    }, JUDGMENT_TIMEOUT)
  }

  // ── 판정 처리 (ref 기반 → stale closure 없음) ────────────────────────────
  const judgeRef = useRef<(call: 'strike' | 'ball' | null) => void>(() => {})

  judgeRef.current = (call: 'strike' | 'ball' | null) => {
    if (pitchPhaseRef.current !== 'judging') return

    clearTimeout(judgeTimerRef.current!)
    clearInterval(countdownRef.current!)

    const pitch  = currentPitchRef.current
    const batter = battersRef.current[batterIndexRef.current]
    if (!pitch || !batter) return

    // 타임아웃 처리
    const judgedCall = call ?? (pitch.isStrike ? 'ball' : 'strike')

    const { score: sc, correct } = calcScore(judgedCall, pitch, batter, comboRef.current)

    const newCombo = correct ? comboRef.current + 1 : 0
    comboRef.current = newCombo
    const newScore = Math.max(0, scoreRef.current + sc)
    scoreRef.current = newScore
    if (newCombo > maxComboRef.current) maxComboRef.current = newCombo

    totalPitchesRef.current++
    if (correct) correctCountRef.current++

    const updatedPitch: PitchParams = {
      ...pitch,
      playerCall: judgedCall,
      correct,
      scoreChange: sc,
      batter,
    }
    pitchHistoryRef.current = [...pitchHistoryRef.current, updatedPitch]
    currentPitchRef.current = updatedPitch

    // 멀티 모드: 점수 실시간 전송
    onScoreUpdate?.(newScore)

    // UI 업데이트
    setScore(newScore)
    setCombo(newCombo)
    setPitchHistory(pitchHistoryRef.current)
    setCurrentPitch(updatedPitch)
    setFeedback({
      type: correct ? (updatedPitch.isBorderline ? 'borderline' : 'correct') : 'wrong',
      call: judgedCall,
      correct,
      scoreChange: sc,
      isBorderline: !!updatedPitch.isBorderline,
      pitchType: updatedPitch.pitchType,
      speed: updatedPitch.speed,
    })
    setAndRefPitchPhase('feedback')

    clearTimeout(feedbackTimerRef.current!)
    setFeedbackVisible(true)
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackVisible(false)
      setFeedback(null)
    }, 1800)

    const bidx = batterIndexRef.current
    pitchInBatterRef.current++

    // 5구 소화 시 타자 교체, 30구 완료 시 게임 종료
    advanceTimerRef.current = setTimeout(() => {
      doAdvanceRef.current(bidx, newScore)
    }, 2000)
  }

  // ── 공 도착 ──────────────────────────────────────────────────────────────
  const handlePitchArrived = useCallback(() => {
    playMittSound()
    setAndRefPitchPhase('judging')
    setCountdown(3)

    if (isReplayActiveRef.current) {
      // 리플레이 활성 중 공 도착 → 타이머 시작 없이 상태만 저장
      ballArrivedDuringReplayRef.current = true
      replayPausePhaseRef.current = 'judging'
      return
    }

    startJudgingRef.current()
  }, [])

  // ── 리플레이 열림 → 게임 일시정지 ──────────────────────────────────────
  useEffect(() => {
    if (!replayPitch) return
    isReplayActiveRef.current = true
    replayPausePhaseRef.current = pitchPhaseRef.current
    replayPauseBidxRef.current = batterIndexRef.current
    ballArrivedDuringReplayRef.current = false

    clearTimeout(judgeTimerRef.current!)
    clearInterval(countdownRef.current!)
    clearTimeout(advanceTimerRef.current!)
    clearTimeout(nextPitchTimerRef.current!)
    clearTimeout(windupTimerRef.current!)
    clearTimeout(feedbackTimerRef.current!)
  }, [replayPitch])

  // ── 리플레이 닫힘 → 게임 재개 ───────────────────────────────────────────
  useEffect(() => {
    if (replayPitch) return
    if (!isReplayActiveRef.current) return   // 초기 렌더 스킵
    isReplayActiveRef.current = false

    const phase = replayPausePhaseRef.current
    const bidx  = replayPauseBidxRef.current

    if (phase === 'judging' || ballArrivedDuringReplayRef.current) {
      // 판정 대기 재개
      ballArrivedDuringReplayRef.current = false
      setAndRefPitchPhase('judging')
      startJudgingRef.current()
    } else if (phase === 'feedback') {
      // 피드백 후 진행 재개
      advanceTimerRef.current = setTimeout(
        () => doAdvanceRef.current(bidx, scoreRef.current), 800
      )
    } else if (phase === 'wind_up') {
      // 와인드업 재시작
      startNextPitch(bidx)
    } else if (phase === 'next' || phase === 'idle') {
      // 다음 타자/투구 시작
      nextPitchTimerRef.current = setTimeout(() => startNextPitch(bidx), 800)
    }
    // 'in_flight': 공이 아직 날아오는 중 → handlePitchArrived 대기
  }, [replayPitch, startNextPitch])

  // ── 씬 준비 → 첫 투구 시작 ─────────────────────────────────────────────
  const handleSceneReady = useCallback(() => {
    setTimeout(() => startNextPitch(0), 800)
  }, [startNextPitch])

  // ── 키보드 입력 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (replayPitch) return  // 리플레이 중 화살표 키는 단계 이동에 양보
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowRight') judgeRef.current('strike')
      if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowLeft')  judgeRef.current('ball')
      // ↑ 마지막 공 리플레이 열기 (pitchHistoryRef로 직접 접근 → 의존성 없음)
      if (e.key === 'ArrowUp') {
        const last = pitchHistoryRef.current.length - 1
        if (last >= 0) {
          const pitch = pitchHistoryRef.current[last]
          setReplayStage(1)
          setReplayStageOverride(undefined)
          setReplayPitch(pitch)
          setReplayPlaying(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replayPitch])

  const currentBatter = battersRef.current[batterIndex] ?? null

  // ── 리플레이 핸들러 ───────────────────────────────────────────────────────
  const handleReplaySelect = useCallback((index: number) => {
    const pitch = pitchHistoryRef.current[index]
    if (!pitch) return
    setReplayStage(1)
    setReplayStageOverride(undefined)
    setReplayPitch(pitch)
    setReplayPlaying(true)
  }, [])

  const handleReplayEnd = useCallback(() => {
    setReplayPlaying(false)
  }, [])

  const handleReplayAgain = useCallback(() => {
    if (!replayPitch) return
    setReplayStage(1)
    setReplayStageOverride(undefined)
    setReplayPlaying(true)
    setReplayPitch({ ...replayPitch })
  }, [replayPitch])

  const handleReplayClose = useCallback(() => {
    setReplayPitch(null)
    setReplayPlaying(false)
    setReplayStage(1)
    setReplayStageOverride(undefined)
  }, [])

  const handleStageChange = useCallback((s: number) => {
    setReplayStage(s)
    setReplayStageOverride(s)
  }, [])

  return (
    <div style={styles.wrap}>
      <BaseballScene
        batter={currentBatter}
        currentPitch={currentPitch}
        pitchPhase={pitchPhase}
        showZone={showZone}
        trajectoryMode={trajectoryMode}
        onPitchArrived={handlePitchArrived}
        onSceneReady={handleSceneReady}
        replayPitch={replayPitch}
        replaySpeed={replaySpeed}
        replayStageOverride={replayStageOverride}
        onReplayEnd={handleReplayEnd}
        onReplayStageChange={setReplayStage}
      />

      <HUD
        pitchCount={pitchCount}
        totalPitches={TOTAL_PITCHES}
        score={score}
        combo={combo}
        pitchPhase={pitchPhase}
        countdown={countdown}
        showZone={showZone}
        onToggleZone={mode === 'practice' ? undefined : () => setShowZone(v => !v)}
      />

      {/* 왼쪽 고정 패널: 타자 정보 + 미니 존 + 멀티 순위 */}
      <LeftPanel
        batterIndex={batterIndex}
        totalBatters={TOTAL_BATTERS}
        batter={currentBatter}
        pitchCount={pitchCount}
        totalPitches={TOTAL_PITCHES}
        multiRankings={multiRankings}
        myUid={myUid}
      />

      {/* 판정 피드백 텍스트 (화면 상단 중앙) — 리플레이 중 숨김 */}
      {feedbackVisible && feedback && !replayPitch && (
        <JudgmentFeedbackUI feedback={feedback} />
      )}

      {/* 2D 존 결과 뷰 (화면 중앙 하단) — 리플레이 중 숨김 */}
      {feedbackVisible && feedback && currentPitch && currentBatter && !replayPitch && (
        <div style={styles.zoneViewWrap}>
          <StrikeZoneResult2D
            pitch={currentPitch}
            batter={currentBatter}
            visible
          />
        </div>
      )}

      <PitchKey
        active={pitchPhase === 'judging'}
        onStrike={() => judgeRef.current('strike')}
        onBall={() => judgeRef.current('ball')}
      />

      <PitchReplayList
        pitches={pitchHistory}
        onSelect={handleReplaySelect}
        selectedIndex={replayPitch ? pitchHistory.findIndex(p => p.pitchIndex === replayPitch.pitchIndex) : -1}
      />

      {/* 리플레이 컨트롤 */}
      {replayPitch && (
        <ReplayControls
          pitch={replayPitch}
          speed={replaySpeed}
          isPlaying={replayPlaying}
          stage={replayStage}
          onSpeedChange={setReplaySpeed}
          onStageChange={handleStageChange}
          onReplay={handleReplayAgain}
          onClose={handleReplayClose}
        />
      )}

      <button style={styles.exitBtn} onClick={onBack}>나가기</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#000',
  },
  zoneViewWrap: {
    position: 'absolute',
    top: '52%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 24,
    pointerEvents: 'none',
  },
  exitBtn: {
    position: 'absolute',
    top: 60, right: 20,
    padding: '5px 12px',
    background: 'rgba(244,67,54,0.7)',
    border: 'none',
    color: '#fff',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    zIndex: 20,
  },
}
