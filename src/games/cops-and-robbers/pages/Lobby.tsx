import { useEffect, useRef, useState } from 'react'
import {
  createRoom,
  joinRoom,
  leaveRoom,
  setPlayerReady,
  setPlayerRole,
  subscribeRoom,
  unsubscribeRoom,
  type RoomData,
} from '../utils/copsRtdb'
import type { DatabaseReference } from 'firebase/database'
import type { PlayerRole } from '../types'

interface LobbyProps {
  uid: string
  name: string
  onStart: (roomId: string, isHost: boolean, myRole: PlayerRole) => void
  onBack: () => void
}

type Tab = 'create' | 'join'

export default function Lobby({ uid, name, onStart, onBack }: LobbyProps) {
  const [tab, setTab] = useState<Tab>('create')
  const [joinCode, setJoinCode] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rtdbRef = useRef<DatabaseReference | null>(null)
  const leftRef = useRef(false)

  useEffect(() => {
    if (!roomId) return
    leftRef.current = false
    const r = subscribeRoom(roomId, (data) => {
      if (leftRef.current) return
      setRoomData(data)
      if (data?.status === 'playing') {
        const myRole: PlayerRole = data.players?.[uid]?.role ?? 'thief'
        onStart(roomId, data.hostUid === uid, myRole)
      }
    })
    rtdbRef.current = r
    return () => { unsubscribeRoom(r) }
  }, [roomId, uid, onStart])

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true); setError(null)
    try {
      const id = await createRoom(uid, name.trim())
      setRoomId(id); setIsHost(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code || !name.trim()) return
    setLoading(true); setError(null)
    try {
      await joinRoom(code, uid, name.trim())
      setRoomId(code); setIsHost(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 참가 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleLeave() {
    if (!roomId) { onBack(); return }
    leftRef.current = true
    if (rtdbRef.current) unsubscribeRoom(rtdbRef.current)
    await leaveRoom(roomId, uid, isHost).catch(() => {})
    setRoomId(null); setRoomData(null); setIsHost(false)
    if (isHost) onBack()
  }

  async function handleReady() {
    if (!roomId || !roomData) return
    const me = roomData.players?.[uid]
    if (!me) return
    await setPlayerReady(roomId, uid, !me.ready).catch(() => {})
  }

  async function handleToggleRole() {
    if (!roomId || !roomData) return
    const me = roomData.players?.[uid]
    if (!me) return
    if (me.role === 'thief') {
      const alreadyCop = Object.values(roomData.players).some(
        (p) => p.uid !== uid && p.role === 'cop',
      )
      if (alreadyCop) return
    }
    const newRole: PlayerRole = me.role === 'cop' ? 'thief' : 'cop'
    await setPlayerRole(roomId, uid, newRole).catch(() => {})
  }

  async function handleStartGame() {
    if (!roomId || !roomData) return
    const { startGame } = await import('../utils/copsRtdb')
    const { buildTileMap } = await import('../engine/createMap')
    const { createSafes } = await import('../engine/safes')
    const { TILE_SIZE, SAFE_TREASURE_GOAL_PER_THIEF } = await import('../constants')

    const thiefCount = Object.values(roomData.players ?? {}).filter((p) => p.role !== 'cop').length
    const treasureGoal = Math.max(3, thiefCount * SAFE_TREASURE_GOAL_PER_THIEF)

    const map = buildTileMap()
    const safes = createSafes(map, 10)
    const botSpawn = { x: TILE_SIZE * 20.5, y: TILE_SIZE * 14.5 }
    await startGame(roomId, safes, botSpawn, treasureGoal)
  }

  const players = roomData ? Object.values(roomData.players ?? {}) : []
  const allReady = players.length >= 2 && players.every((p) => p.ready || p.uid === uid)
  const canStart = isHost && players.length >= 2 && allReady

  // ── Waiting room ─────────────────────────────────────────────────────────────
  if (roomId && roomData) {
    const me = roomData.players?.[uid]
    return (
      <div style={rootStyle}>
        <div style={cardStyle}>
          <div style={roomHeaderStyle}>
            <span style={roomCodeLabelStyle}>방 코드</span>
            <span style={roomCodeStyle}>{roomId}</span>
            <span style={roomStatusStyle}>{players.length}/4명</span>
          </div>

          <div style={playerListStyle}>
            {players.map((p) => {
              const isCop = p.role === 'cop'
              const isMe = p.uid === uid
              const otherHasCop = players.some((q) => q.uid !== uid && q.role === 'cop')
              const canToggle = isMe && (isCop || !otherHasCop)
              return (
                <div key={p.uid} style={playerRowStyle}>
                  <span style={playerNameStyle}>
                    {p.name}
                    {p.uid === roomData.hostUid && <span style={hostBadgeStyle}> 방장</span>}
                    {isMe && <span style={meBadgeStyle}> (나)</span>}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isMe ? (
                      <button
                        style={{
                          ...roleBtnStyle,
                          background: isCop ? '#3b0a0a' : '#0f2027',
                          color: isCop ? '#fca5a5' : '#7dd3fc',
                          border: `1px solid ${isCop ? '#ef4444' : '#38bdf8'}`,
                          opacity: canToggle ? 1 : 0.4,
                          cursor: canToggle ? 'pointer' : 'default',
                        }}
                        onClick={canToggle ? handleToggleRole : undefined}
                      >
                        {isCop ? '🚔 경찰' : '🕵️ 도둑'}
                      </button>
                    ) : (
                      <span style={{ ...roleBtnStyle, background: isCop ? '#3b0a0a' : '#0f2027', color: isCop ? '#fca5a5' : '#7dd3fc' }}>
                        {isCop ? '🚔 경찰' : '🕵️ 도둑'}
                      </span>
                    )}
                    <span style={{ color: p.ready ? '#34d399' : '#6b7280', fontSize: 12 }}>
                      {p.ready ? '준비' : '대기'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={actionRowStyle}>
            <button style={secondaryBtnStyle} onClick={handleLeave}>
              {isHost ? '방 삭제' : '나가기'}
            </button>
            {!isHost && (
              <button
                style={{
                  ...primaryBtnStyle,
                  background: me?.ready ? '#1b2230' : '#38bdf8',
                  color: me?.ready ? '#e4e7ef' : '#05070d',
                }}
                onClick={handleReady}
              >
                {me?.ready ? '준비 취소' : '준비 완료'}
              </button>
            )}
            {isHost && (
              <button
                style={{ ...primaryBtnStyle, opacity: canStart ? 1 : 0.4, cursor: canStart ? 'pointer' : 'default' }}
                onClick={canStart ? handleStartGame : undefined}
                disabled={!canStart}
              >
                게임 시작
              </button>
            )}
          </div>

          {players.length < 2 && (
            <p style={hintTextStyle}>상대방이 방 코드를 입력해 참가하면 게임을 시작할 수 있습니다.</p>
          )}
          {players.length >= 2 && !allReady && (
            <p style={hintTextStyle}>모든 플레이어가 준비 완료되면 방장이 게임을 시작합니다.</p>
          )}
        </div>
      </div>
    )
  }

  // ── Create / Join tabs ────────────────────────────────────────────────────────
  return (
    <div style={rootStyle}>
      <div style={cardStyle}>
        <div style={titleRowStyle}>
          <div style={thumbStyle}>🕵️</div>
          <div>
            <h1 style={titleStyle}>멀티플레이 로비</h1>
            <p style={subtitleStyle}>경찰과 도둑 · 2~4인 협동</p>
          </div>
        </div>

        <div style={tabRowStyle}>
          <button
            style={{ ...tabBtnStyle, ...(tab === 'create' ? tabActiveBtnStyle : {}) }}
            onClick={() => setTab('create')}
          >
            방 만들기
          </button>
          <button
            style={{ ...tabBtnStyle, ...(tab === 'join' ? tabActiveBtnStyle : {}) }}
            onClick={() => setTab('join')}
          >
            방 참가
          </button>
        </div>

        {tab === 'create' ? (
          <div style={formColStyle}>
            <p style={formDescStyle}>방을 생성하면 코드를 친구와 공유하세요.</p>
            <button
              style={{ ...primaryBtnStyle, opacity: loading ? 0.5 : 1 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '생성 중…' : '방 만들기'}
            </button>
          </div>
        ) : (
          <div style={formColStyle}>
            <input
              style={inputStyle}
              placeholder="방 코드 6자리 입력"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              style={{ ...primaryBtnStyle, opacity: loading || !joinCode.trim() ? 0.5 : 1 }}
              onClick={handleJoin}
              disabled={loading || !joinCode.trim()}
            >
              {loading ? '참가 중…' : '참가'}
            </button>
          </div>
        )}

        {error && <p style={errorStyle}>{error}</p>}

        <button style={{ ...secondaryBtnStyle, marginTop: 12 }} onClick={onBack}>
          ← 돌아가기
        </button>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at 30% 10%, #141a28 0%, #05070d 55%)',
  color: '#e4e7ef',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: '#0f131d',
  border: '1px solid #1c2331',
  borderRadius: 14,
  padding: 28,
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginBottom: 22,
}

const thumbStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 12,
  background: '#1a2030',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 28,
}

const titleStyle: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700 }
const subtitleStyle: React.CSSProperties = { margin: '4px 0 0', color: '#8a93a6', fontSize: 13 }

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 18,
}

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  background: '#121725',
  border: '1px solid #1f2638',
  color: '#8a93a6',
  padding: '9px 0',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
}

const tabActiveBtnStyle: React.CSSProperties = {
  background: '#1a2535',
  border: '1px solid #38bdf8',
  color: '#38bdf8',
}

const formColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginBottom: 8,
}

const formDescStyle: React.CSSProperties = { color: '#8a93a6', fontSize: 13, margin: 0 }

const inputStyle: React.CSSProperties = {
  background: '#121725',
  border: '1px solid #2a3345',
  color: '#e4e7ef',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 16,
  fontFamily: 'ui-monospace, monospace',
  letterSpacing: 4,
  outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  background: '#38bdf8',
  color: '#05070d',
  border: 'none',
  padding: '11px 18px',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

const secondaryBtnStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '10px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
}

const errorStyle: React.CSSProperties = {
  color: '#fca5a5',
  fontSize: 13,
  margin: '4px 0 0',
}

const roomHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 18,
  padding: '12px 16px',
  background: '#121725',
  border: '1px solid #1f2638',
  borderRadius: 10,
}

const roomCodeLabelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#7dd3fc',
  fontWeight: 700,
}

const roomCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 6,
  color: '#e4e7ef',
  flex: 1,
  textAlign: 'center',
}

const roomStatusStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#8a93a6',
}

const playerListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 18,
}

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  background: '#121725',
  border: '1px solid #1f2638',
  borderRadius: 8,
}

const playerNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
}

const hostBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#fbbf24',
  fontWeight: 700,
}

const meBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#7dd3fc',
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
}

const hintTextStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  color: '#6b7280',
  textAlign: 'center',
}

const roleBtnStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: 12,
  border: '1px solid transparent',
  cursor: 'pointer',
}
