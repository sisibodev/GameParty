import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GameMode, Difficulty, PitchParams } from './types'
import { useAuth } from '../../contexts/AuthContext'
import { MultiRoom, submitMultiResult, finishMultiRoom } from './utils/umpire-rtdb'
import ModeSelect from './pages/ModeSelect'
import GamePlay from './pages/GamePlay'
import ResultScreen from './pages/ResultScreen'
import MultiRoomEnter from './pages/MultiRoomEnter'
import MultiLobby from './pages/MultiLobby'
import MultiResult from './pages/MultiResult'

type Phase =
  | 'select'
  | 'playing'
  | 'result'
  | 'multi_enter'     // 방 생성/참가 화면
  | 'multi_lobby'     // 대기실
  | 'multi_playing'   // 멀티 게임 진행
  | 'multi_result'    // 멀티 결과 비교

interface GameResult {
  score: number
  totalPitches: number
  correctCount: number
  maxCombo: number
  pitchHistory: PitchParams[]
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

  const [phase, setPhase]         = useState<Phase>('select')
  const [mode, setMode]           = useState<GameMode>('normal')
  const [difficulty, setDiff]     = useState<Difficulty>('amateur')
  const [result, setResult]       = useState<GameResult | null>(null)

  // 멀티 전용
  const [multiRoomId, setMultiRoomId]   = useState<string>('')
  const [multiRoom, setMultiRoom]       = useState<MultiRoom | null>(null)

  // ── 싱글플레이 ──────────────────────────────────────────────────────────────
  const handleStart = (m: GameMode, d: Difficulty) => {
    setMode(m)
    setDiff(d)
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
    setPhase('multi_playing')
  }

  const handleMultiGameEnd = async (r: GameResult) => {
    if (!user || !multiRoomId) return
    setResult(r)

    // 내 결과 제출
    await submitMultiResult(multiRoomId, user.uid, {
      score:        r.score,
      correctCount: r.correctCount,
      totalPitches: r.totalPitches,
      maxCombo:     r.maxCombo,
    })

    // 방 전체 완료 체크는 MultiResult 쪽에서 실시간으로 감지
    // 방장이면 일정 시간 후 status를 finished로 변경 (옵션)
    if (multiRoom?.hostUid === user.uid) {
      // 비동기로 방 종료 상태 업데이트 (다른 플레이어도 완료 후 결과 확인 가능)
      finishMultiRoom(multiRoomId).catch(() => {})
    }

    setPhase('multi_result')
  }

  // ── 렌더 ────────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <ModeSelect
        onStart={handleStart}
        onMultiBattle={handleMultiBattle}
        onBack={() => navigate('/')}
      />
    )
  }

  if (phase === 'playing') {
    return (
      <GamePlay
        mode={mode}
        difficulty={difficulty}
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
        onGameEnd={handleMultiGameEnd}
        onBack={() => setPhase('multi_lobby')}
      />
    )
  }

  if (phase === 'multi_result' && user) {
    return (
      <MultiResult
        roomId={multiRoomId}
        user={user}
        onRetry={() => {
          // 같은 방에서 재대기
          setPhase('multi_lobby')
        }}
        onLobby={() => navigate('/')}
      />
    )
  }

  return null
}
