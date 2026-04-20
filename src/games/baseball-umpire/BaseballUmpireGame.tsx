import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DatabaseReference } from 'firebase/database'
import { GameMode, Difficulty, TrajectoryMode, PitchParams } from './types'
import { useAuth } from '../../contexts/AuthContext'
import {
  MultiRoom, submitMultiResult, finishMultiRoom,
  subscribeMultiRoom, unsubscribeMultiRoom,
  updateLiveScore,
} from './utils/umpire-rtdb'
import { saveUmpireRecord } from './utils/firestore'
import { loadAndApplyPitchConfig } from './utils/pitchConfig'
import { isAdmin } from './utils/admin'
import { getMyTeam } from './utils/kboTeams'
import ModeSelect from './pages/ModeSelect'
import GamePlay from './pages/GamePlay'
import ResultScreen from './pages/ResultScreen'
import PitchEditor from './pages/PitchEditor'
import MultiRoomEnter from './pages/MultiRoomEnter'
import MultiLobby from './pages/MultiLobby'
import MultiResult from './pages/MultiResult'

type Phase =
  | 'select'
  | 'playing'
  | 'result'
  | 'pitch_editor'
  | 'multi_enter'
  | 'multi_lobby'
  | 'multi_playing'
  | 'multi_result'

interface GameResult {
  score: number
  totalPitches: number
  correctCount: number
  maxCombo: number
  pitchHistory: PitchParams[]
}

interface MultiRankEntry {
  uid: string
  email: string
  score: number
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  rookie:   '루키',
  amateur:  '아마추어',
  pro:      '프로',
  major:    '메이저',
}

export default function BaseballUmpireGame() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const adminUser = isAdmin(user?.email)

  // 앱 시작 시 Firestore에서 pitch config 로드 & 적용
  useEffect(() => {
    loadAndApplyPitchConfig().catch(() => {})
  }, [])

  const [phase, setPhase]             = useState<Phase>('select')
  const [mode, setMode]               = useState<GameMode>('normal')
  const [difficulty, setDiff]         = useState<Difficulty>('amateur')
  const [trajectoryMode, setTrajMode] = useState<TrajectoryMode>('bezier')
  const [result, setResult]           = useState<GameResult | null>(null)

  // 멀티 전용
  const [multiRoomId, setMultiRoomId]       = useState<string>('')
  const [multiRoom, setMultiRoom]           = useState<MultiRoom | null>(null)
  const [multiRankings, setMultiRankings]   = useState<MultiRankEntry[]>([])
  const multiRtdbRefRef = useRef<DatabaseReference | null>(null)

  // ── 멀티 플레이 중 실시간 순위 구독 ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'multi_playing' || !multiRoomId) return

    const rtdbRef = subscribeMultiRoom(multiRoomId, (room) => {
      if (!room?.players) return
      const entries: MultiRankEntry[] = Object.values(room.players).map(p => ({
        uid: p.uid,
        email: p.email,
        score: p.score,
      }))
      setMultiRankings(entries)
    })
    multiRtdbRefRef.current = rtdbRef

    return () => {
      if (multiRtdbRefRef.current) {
        unsubscribeMultiRoom(multiRtdbRefRef.current)
        multiRtdbRefRef.current = null
      }
    }
  }, [phase, multiRoomId])

  // ── 싱글플레이 ──────────────────────────────────────────────────────────────
  const handleStart = (m: GameMode, d: Difficulty, traj: TrajectoryMode) => {
    setMode(m)
    setDiff(d)
    setTrajMode(traj)
    setPhase('playing')
  }

  const handleGameEnd = (r: GameResult) => {
    setResult(r)
    setPhase('result')
  }

  // ── 멀티 플로우 ─────────────────────────────────────────────────────────────
  const handleMultiBattle = () => {
    if (!user) {
      alert('멀티 배틀은 로그인이 필요합니다.')
      return
    }
    setPhase('multi_enter')
  }

  const handleRoomCreated = (roomId: string, diff: Difficulty) => {
    setMultiRoomId(roomId)
    setDiff(diff)
    setPhase('multi_lobby')
  }

  const handleRoomJoined = (roomId: string) => {
    setMultiRoomId(roomId)
    setPhase('multi_lobby')
  }

  const handleMultiGameStart = (room: MultiRoom) => {
    setMultiRoom(room)
    setDiff(room.difficulty)
    setMultiRankings([])
    setPhase('multi_playing')
  }

  const handleMultiGameEnd = async (r: GameResult) => {
    if (!user || !multiRoomId) return
    setResult(r)

    await submitMultiResult(multiRoomId, user.uid, {
      score:        r.score,
      correctCount: r.correctCount,
      totalPitches: r.totalPitches,
      maxCombo:     r.maxCombo,
      pitchResults: r.pitchHistory.map(p => ({
        call:    p.playerCall ?? null,
        correct: p.correct ?? false,
      })),
    })

    if (multiRoom?.hostUid === user.uid) {
      finishMultiRoom(multiRoomId).catch(() => {})
    }

    // 멀티 결과도 Firestore에 저장 (① 랭킹 반영)
    saveUmpireRecord({
      uid:         user.uid,
      email:       user.email ?? 'anonymous',
      difficulty:  DIFFICULTY_LABELS[difficulty],
      totalPitches: r.totalPitches,
      correctCount: r.correctCount,
      score:        r.score,
      maxCombo:     r.maxCombo,
      pitchHistory: r.pitchHistory,
      teamId:       getMyTeam()?.id,
    }).catch(() => {})

    setPhase('multi_result')
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <ModeSelect
        onStart={handleStart}
        onMultiBattle={handleMultiBattle}
        onPitchEditor={adminUser ? () => setPhase('pitch_editor') : undefined}
        onBack={() => navigate('/')}
        user={user ?? undefined}
      />
    )
  }

  if (phase === 'pitch_editor') {
    return <PitchEditor onBack={() => setPhase('select')} />
  }

  if (phase === 'playing') {
    return (
      <GamePlay
        mode={mode}
        difficulty={difficulty}
        trajectoryMode={trajectoryMode}
        onGameEnd={handleGameEnd}
        onBack={() => setPhase('select')}
      />
    )
  }

  if (phase === 'result' && result) {
    return (
      <ResultScreen
        score={result.score}
        totalPitches={result.totalPitches}
        correctCount={result.correctCount}
        maxCombo={result.maxCombo}
        pitchHistory={result.pitchHistory}
        mode={mode}
        difficulty={DIFFICULTY_LABELS[difficulty]}
        user={user}
        onRetry={() => setPhase('playing')}
        onLobby={() => navigate('/')}
      />
    )
  }

  if (phase === 'multi_enter' && user) {
    return (
      <MultiRoomEnter
        user={user}
        onRoomCreated={handleRoomCreated}
        onRoomJoined={handleRoomJoined}
        onBack={() => setPhase('select')}
      />
    )
  }

  if (phase === 'multi_lobby' && user) {
    return (
      <MultiLobby
        roomId={multiRoomId}
        user={user}
        onGameStart={handleMultiGameStart}
        onBack={() => setPhase('multi_enter')}
      />
    )
  }

  if (phase === 'multi_playing' && multiRoom) {
    return (
      <GamePlay
        mode="normal"
        difficulty={multiRoom.difficulty}
        initialSeed={multiRoom.seed}
        multiRankings={multiRankings}
        myUid={user?.uid}
        onScoreUpdate={(score) => {
          if (user && multiRoomId) updateLiveScore(multiRoomId, user.uid, score)
        }}
        onGameEnd={handleMultiGameEnd}
        onBack={() => setPhase('multi_lobby')}
      />
    )
  }

  if (phase === 'multi_result' && user && result) {
    return (
      <MultiResult
        roomId={multiRoomId}
        user={user}
        difficulty={DIFFICULTY_LABELS[difficulty]}
        score={result.score}
        totalPitches={result.totalPitches}
        correctCount={result.correctCount}
        maxCombo={result.maxCombo}
        pitchHistory={result.pitchHistory}
        onRetry={() => setPhase('multi_lobby')}
        onRetryWithNewSettings={() => setPhase('multi_enter')}
        onLobby={() => navigate('/')}
      />
    )
  }

  return null
}
