import { useEffect, useRef, useState, useCallback } from 'react'
import {
  BatterProfile, Difficulty, GameMode, JudgmentFeedback,
  PitchParams, PitchPhase, DIFFICULTY_CONFIG,
} from '../types'
import { SeededRng, randomSeed } from '../utils/rng'
import { generateBatters } from '../utils/batter'
import { generatePitch, calcScore } from '../utils/pitch'
import BaseballScene from '../components/BaseballScene'
import BatterIntro from '../components/BatterIntro'
import HUD from '../components/HUD'
import JudgmentFeedbackUI from '../components/JudgmentFeedback'
import PitchKey from '../components/PitchKey'
import PitchReplayList from '../components/PitchReplayList'
import ReplayControls from '../components/ReplayControls'
import StrikeZoneResult2D from '../components/StrikeZoneResult2D'
import { playMittSound } from '../utils/sound'

const TOTAL_BATTERS = 9
const JUDGMENT_TIMEOUT = 3000

interface Props {
  mode: GameMode
  difficulty: Difficulty
  initialSeed?: number   // 멀티 모드: 공통 시드 고정
  onGameEnd: (result: {
    score: number
    totalPitches: number
    correctCount: number
    maxCombo: number
    pitchHistory: PitchParams[]
  }) => void
  onBack: () => void
}

export default function GamePlay({ mode, difficulty, initialSeed, onGameEnd, onBack }: Props) {
  const config = DIFFICULTY_CONFIG[difficulty]

  // ── React state (UI 렌더용) ───────────────────────────────────────────────
  const [batterIndex, setBatterIndex]     = useState(0)
  const [balls, setBalls]                 = useState(0)
  const [strikes, setStrikes]             = useState(0)
  const [score, setScore]                 = useState(0)
  const [combo, setCombo]                 = useState(0)
  const [totalPitches, setTotalPitches]   = useState(0)
  const [correctCount, setCorrectCount]   = useState(0)
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
  // 타자 인트로
  const [showBatterIntro, setShowBatterIntro] = useState(false)

  // ── Refs (stale closure 방지용 최신값 저장) ──────────────────────────────
  const rngRef          = useRef<SeededRng>(new SeededRng(initialSeed ?? randomSeed()))
  const battersRef      = useRef<BatterProfile[]>([])
  const judgeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const pitchIndexRef   = useRef(0)

  // 게임 상태 최신값 ref
  const batterIndexRef  = useRef(0)
  const ballsRef        = useRef(0)
  const strikesRef      = useRef(0)
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
    rngRef.current = new SeededRng(initialSeed ?? randomSeed())
    battersRef.current = generateBatters(rngRef.current, TOTAL_BATTERS)
  // initialSeed는 마운트 시 1회만 사용
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 존 표시 ──────────────────────────────────────────────────────────────
  const showZoneTemporarily = useCallback(() => {
    if (mode === 'practice') return
    setShowZone(true)
    setTimeout(() => setShowZone(false), config.zoneShowTime)
  }, [mode, config.zoneShowTime])

  // ── 다음 투구 시작 ───────────────────────────────────────────────────────
  const startNextPitch = useCallback((bidx: number) => {
    const batter = battersRef.current[bidx]
    if (!batter) return

    showZoneTemporarily()
    setAndRefPitchPhase('wind_up')

    setTimeout(() => {
      // 타자 3명마다 구속 10km/h 증가 (0→+0, 3→+10, 6→+20)
      const speedBonus = Math.floor(bidx / 3) * 10
      const boostedConfig = {
        ...config,
        speedMin: config.speedMin + speedBonus,
        speedMax: config.speedMax + speedBonus,
      }
      const pitch = generatePitch(
        rngRef.current, bidx, batter, boostedConfig, pitchIndexRef.current++
      )
      currentPitchRef.current = pitch
      setCurrentPitch(pitch)
      setAndRefPitchPhase('in_flight')
    }, 1200)
  }, [config, showZoneTemporarily])

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
    let judgedCall = call
    if (!call) {
      judgedCall = pitch.isStrike ? 'ball' : 'strike'
    }

    const { score: sc, correct } = judgedCall
      ? calcScore(judgedCall, pitch, batter, comboRef.current)
      : { score: -100, correct: false }

    const newCombo = correct ? comboRef.current + 1 : 0
    comboRef.current = newCombo
    const newScore = Math.max(0, scoreRef.current + sc)
    scoreRef.current = newScore
    if (newCombo > maxComboRef.current) maxComboRef.current = newCombo

    totalPitchesRef.current++
    if (correct) correctCountRef.current++

    const updatedPitch: PitchParams = {
      ...pitch,
      playerCall: judgedCall ?? undefined,
      correct,
      scoreChange: sc,
    }
    pitchHistoryRef.current = [...pitchHistoryRef.current, updatedPitch]
    currentPitchRef.current = updatedPitch

    // UI 업데이트
    setScore(newScore)
    setCombo(newCombo)
    setTotalPitches(totalPitchesRef.current)
    setCorrectCount(correctCountRef.current)
    setPitchHistory(pitchHistoryRef.current)
    setCurrentPitch(updatedPitch)
    setFeedback({
      type: correct ? (updatedPitch.isBorderline ? 'borderline' : 'correct') : 'wrong',
      call: judgedCall!,
      correct,
      scoreChange: sc,
      isBorderline: !!updatedPitch.isBorderline,
      pitchType: updatedPitch.pitchType,
      speed: updatedPitch.speed,
    })
    setAndRefPitchPhase('feedback')

    // 피드백 + 2D 존 뷰 1.8초간 표시 후 함께 숨김
    clearTimeout(feedbackTimerRef.current!)
    setFeedbackVisible(true)
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackVisible(false)
      setFeedback(null)
    }, 1800)

    // 카운트 업데이트
    let newBalls   = ballsRef.current
    let newStrikes = strikesRef.current
    if (pitch.isStrike) newStrikes = Math.min(newStrikes + 1, 3)
    else                newBalls   = Math.min(newBalls + 1, 4)
    ballsRef.current   = newBalls
    strikesRef.current = newStrikes
    setBalls(newBalls)
    setStrikes(newStrikes)

    const bidx = batterIndexRef.current

    // 타자 교체 or 다음 투구
    setTimeout(() => {
      setFeedback(null)
      setAndRefPitchPhase('next')

      if (newStrikes >= 3 || newBalls >= 4) {
        const nextBidx = bidx + 1
        if (nextBidx >= TOTAL_BATTERS) {
          // 게임 종료
          onGameEnd({
            score: newScore,
            totalPitches: totalPitchesRef.current,
            correctCount: correctCountRef.current,
            maxCombo: maxComboRef.current,
            pitchHistory: pitchHistoryRef.current,
          })
        } else {
          batterIndexRef.current = nextBidx
          ballsRef.current   = 0
          strikesRef.current = 0
          setBatterIndex(nextBidx)
          setBalls(0)
          setStrikes(0)
          showBatterIntroForRef.current(config.zoneShowTime + 500)
          setTimeout(() => startNextPitch(nextBidx), 1500)
        }
      } else {
        setTimeout(() => startNextPitch(bidx), 1200)
      }
    }, 2000)
  }

  // ── 공 도착 ──────────────────────────────────────────────────────────────
  const handlePitchArrived = useCallback(() => {
    playMittSound()
    setAndRefPitchPhase('judging')
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
  }, [])

  // ── 타자 인트로 표시 (표시 시간 = config.zoneShowTime + 500ms) ──────────
  const showBatterIntroFor = useCallback((ms: number) => {
    setShowBatterIntro(true)
    setTimeout(() => setShowBatterIntro(false), ms)
  }, [])
  const showBatterIntroForRef = useRef(showBatterIntroFor)
  showBatterIntroForRef.current = showBatterIntroFor

  // ── 씬 준비 → 첫 투구 시작 ─────────────────────────────────────────────
  const handleSceneReady = useCallback(() => {
    showBatterIntroFor(config.zoneShowTime + 500)
    setTimeout(() => startNextPitch(0), 800)
  }, [startNextPitch, showBatterIntroFor, config.zoneShowTime])

  // ── 키보드 입력 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') judgeRef.current('strike')
      if (e.key === 'b' || e.key === 'B') judgeRef.current('ball')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const currentBatter = battersRef.current[batterIndex] ?? null

  // ── 리플레이 핸들러 ───────────────────────────────────────────────────────
  const handleReplaySelect = useCallback((index: number) => {
    const pitch = pitchHistoryRef.current[index]
    if (!pitch) return
    setReplayPitch(pitch)
    setReplayPlaying(true)
  }, [])

  const handleReplayEnd = useCallback(() => {
    setReplayPlaying(false)
  }, [])

  const handleReplayAgain = useCallback(() => {
    if (!replayPitch) return
    // 같은 투구를 재생하려면 새 객체로 교체해서 useEffect 재트리거
    setReplayPlaying(true)
    setReplayPitch({ ...replayPitch })
  }, [replayPitch])

  const handleReplayClose = useCallback(() => {
    setReplayPitch(null)
    setReplayPlaying(false)
  }, [])

  return (
    <div style={styles.wrap}>
      <BaseballScene
        batter={currentBatter}
        currentPitch={currentPitch}
        pitchPhase={pitchPhase}
        showZone={showZone}
        onPitchArrived={handlePitchArrived}
        onSceneReady={handleSceneReady}
        replayPitch={replayPitch}
        replaySpeed={replaySpeed}
        onReplayEnd={handleReplayEnd}
      />

      <HUD
        batterIndex={batterIndex}
        totalBatters={TOTAL_BATTERS}
        balls={balls}
        strikes={strikes}
        score={score}
        combo={combo}
        batter={currentBatter}
        pitchPhase={pitchPhase}
        countdown={countdown}
        showZone={showZone}
        onToggleZone={mode === 'practice' ? undefined : () => setShowZone(v => !v)}
      />

      {/* 타자 인트로 오버레이 */}
      {showBatterIntro && currentBatter && (
        <BatterIntro
          batter={currentBatter}
          batterIndex={batterIndex}
          totalBatters={TOTAL_BATTERS}
          visible
        />
      )}

      {/* 판정 피드백 텍스트 (화면 상단 중앙) */}
      {feedbackVisible && feedback && (
        <JudgmentFeedbackUI feedback={feedback} />
      )}

      {/* 2D 존 결과 뷰 (화면 오른쪽 중단 — 피드백 텍스트와 분리) */}
      {feedbackVisible && feedback && currentPitch && currentBatter && (
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
          onSpeedChange={setReplaySpeed}
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
  // 2D 존 뷰: 화면 오른쪽 — JudgmentFeedback(상단 중앙)과 겹치지 않게
  zoneViewWrap: {
    position: 'absolute',
    top: '50%', right: 20,
    transform: 'translateY(-50%)',
    zIndex: 24,
    pointerEvents: 'none',
  },
  debug: {
    position: 'absolute',
    bottom: 130, left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)',
    color: '#0f0',
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 6,
    fontFamily: 'monospace',
    zIndex: 20,
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
