import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Phase, PlayerRole, ResultStats } from './types'
import ModeSelect from './pages/ModeSelect'
import GamePlay from './pages/GamePlay'
import Lobby from './pages/Lobby'
import ResultScreen from './pages/ResultScreen'
import RankingScreen from './pages/RankingScreen'

function getOrCreateUid(): string {
  const key = 'cops_robbers_uid'
  const stored = sessionStorage.getItem(key)
  if (stored) return stored
  const id = crypto.randomUUID()
  sessionStorage.setItem(key, id)
  return id
}

export default function CopsAndRobbersGame() {
  const navigate = useNavigate()
  const uid = useRef(getOrCreateUid()).current
  const [name, setName] = useState(() => `도둑${Math.floor(Math.random() * 900) + 100}`)
  const [phase, setPhase] = useState<Phase>('select')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [myRole, setMyRole] = useState<PlayerRole>('thief')
  const [resultStats, setResultStats] = useState<ResultStats | null>(null)

  if (phase === 'ranking') {
    return <RankingScreen onBack={() => setPhase('select')} />
  }

  if (phase === 'demo') {
    return <GamePlay onBack={() => setPhase('select')} isDemo />
  }

  if (phase === 'select') {
    return (
      <ModeSelect
        onSolo={() => setPhase('solo')}
        onMulti={() => setPhase('lobby')}
        onDemo={() => setPhase('demo')}
        onRanking={() => setPhase('ranking')}
        onBack={() => navigate('/')}
        name={name}
        onNameChange={setName}
      />
    )
  }

  if (phase === 'solo') {
    return <GamePlay onBack={() => setPhase('select')} />
  }

  if (phase === 'lobby') {
    return (
      <Lobby
        uid={uid}
        name={name}
        onStart={(id, host, role) => {
          setRoomId(id)
          setIsHost(host)
          setMyRole(role)
          setPhase('playing')
        }}
        onBack={() => setPhase('select')}
      />
    )
  }

  if (phase === 'playing') {
    return (
      <GamePlay
        onBack={() => {
          setPhase('select')
          setRoomId(null)
        }}
        onGameEnd={(stats) => {
          setResultStats(stats)
          setPhase('result')
        }}
        roomId={roomId ?? undefined}
        uid={uid}
        isHost={isHost}
        myRole={myRole}
      />
    )
  }

  if (phase === 'result' && resultStats) {
    return (
      <ResultScreen
        stats={resultStats}
        onBack={() => {
          setResultStats(null)
          setRoomId(null)
          setPhase('select')
        }}
      />
    )
  }

  return null
}
