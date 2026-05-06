import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../../contexts/AuthContext'
import {
  subscribeTwoBounceRoom,
  registerOnDisconnect,
  startTwoBounceRoomGame,
  leaveTwoBounceRoom,
} from '../../utils/rtdb'
import {
  addDevGuestPlayer,
  removeDevGuestPlayer,
  isDevGuestUid,
} from '../../utils/devGuest'
import type { TwoBounceRoom } from '../../types.multi'
import styles from './multi.module.css'

const MIN_PLAYERS_TO_START = 2
const isDev = import.meta.env.DEV
const TWO_BOUNCE_BASE = '/game/two-bounce'

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<TwoBounceRoom | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [devLoading, setDevLoading] = useState(false)

  useEffect(() => {
    if (!roomId || !user) return

    // 5초 내 데이터가 오지 않으면 에러 표시 (Firebase 연결 실패 등)
    const timeoutId = setTimeout(() => {
      setLoaded((prev) => {
        if (!prev) {
          setError('방 정보를 불러오지 못했습니다. 네트워크 또는 권한을 확인해주세요.')
          return true
        }
        return prev
      })
    }, 5000)

    try {
      registerOnDisconnect(roomId, user.uid)
    } catch {
      // onDisconnect 등록 실패는 치명적이지 않으므로 무시
    }

    const unsubscribe = subscribeTwoBounceRoom(
      roomId,
      (next) => {
        clearTimeout(timeoutId)
        setRoom(next)
        setLoaded(true)
      },
      (err) => {
        clearTimeout(timeoutId)
        setError(err.message || '방 구독에 실패했습니다.')
        setLoaded(true)
      },
    )
    return () => {
      clearTimeout(timeoutId)
      unsubscribe()
    }
  }, [roomId, user])

  // 게임이 시작되면 멀티 게임 페이지로 자동 이동
  useEffect(() => {
    if (room?.status === 'playing' && roomId) {
      navigate(`${TWO_BOUNCE_BASE}/multi/play/${roomId}`, { replace: true })
    }
  }, [room?.status, roomId, navigate])

  // 방에 참가하지 않은 사용자가 직접 접근하면 join 화면으로 안내
  useEffect(() => {
    if (!loaded || !room || !user || !roomId) return
    if (!room.players[user.uid]) {
      navigate(`${TWO_BOUNCE_BASE}/multi/join?roomId=${roomId}`, { replace: true })
    }
  }, [loaded, room, user, roomId, navigate])

  const handleCopy = async () => {
    if (!roomId) return
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleCopyLink = async () => {
    if (!roomId) return
    const link = `${window.location.origin}${TWO_BOUNCE_BASE}/multi/join?roomId=${roomId}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1500)
    } catch {
      setCopiedLink(false)
    }
  }

  const handleStart = async () => {
    if (!roomId || !user) return
    setActionLoading(true)
    setError(null)
    try {
      await startTwoBounceRoomGame(roomId, user.uid)
    } catch (e) {
      setError(e instanceof Error ? e.message : '게임 시작에 실패했습니다.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddGuest = async () => {
    if (!roomId) return
    setDevLoading(true)
    setError(null)
    try {
      await addDevGuestPlayer(roomId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '게스트 추가에 실패했습니다.')
    } finally {
      setDevLoading(false)
    }
  }

  const handleRemoveGuest = async (guestUid: string) => {
    if (!roomId) return
    setDevLoading(true)
    setError(null)
    try {
      await removeDevGuestPlayer(roomId, guestUid)
    } catch (e) {
      setError(e instanceof Error ? e.message : '게스트 제거에 실패했습니다.')
    } finally {
      setDevLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!roomId || !user) {
      navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })
      return
    }
    setActionLoading(true)
    try {
      await leaveTwoBounceRoom(roomId, user.uid)
    } catch {
      // 무시 — 나가는 경로이므로 실패해도 화면 이동
    } finally {
      navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })
    }
  }

  if (!loaded) {
    return (
      <div className={styles.wrap}>
        <div className={styles.title}>대기방</div>
        <div className={styles.card}>
          <div className={styles.center}>방 정보를 불러오는 중...</div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className={styles.wrap}>
        <div className={styles.title}>대기방</div>
        <div className={styles.card}>
          <div className={styles.error}>존재하지 않는 방입니다.</div>
          <button className={styles.primaryBtn} onClick={() => navigate(`${TWO_BOUNCE_BASE}/multi`, { replace: true })}>
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  const isHost = user?.uid === room.hostUid
  const playerCount = room.turnOrder.length
  const canStart = isHost && playerCount >= MIN_PLAYERS_TO_START && room.status === 'waiting'
  const orderedPlayers = room.turnOrder
    .map((uid) => room.players[uid])
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <div className={styles.wrap}>
      <div className={styles.title}>대기방</div>
      <div className={styles.card}>
        <div>
          <div className={styles.sectionLabel}>방 코드</div>
          <div className={styles.roomCodeRow}>
            <div className={styles.roomCode}>{room.id}</div>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? '복사됨 ✓' : '코드 복사'}
            </button>
          </div>
          <div className={styles.inviteLinkRow}>
            <button className={styles.inviteLinkBtn} onClick={handleCopyLink}>
              {copiedLink ? '링크 복사됨 ✓' : '초대 링크 복사'}
            </button>
          </div>
        </div>

        <div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>목표 골</span>
            <span className={styles.infoValue}>{room.targetGoals}골</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>인원</span>
            <span className={styles.infoValue}>
              {playerCount} / {room.maxPlayers}
            </span>
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>플레이어</div>
          <div className={styles.playerList}>
            {orderedPlayers.map((p) => (
              <div key={p.uid} className={styles.playerItem}>
                <span
                  className={`${styles.connDot} ${p.connected ? styles.connOn : styles.connOff}`}
                  title={p.connected ? '접속 중' : '연결 끊김'}
                />
                <span className={styles.playerName}>{p.displayName}</span>
                {p.uid === room.hostUid && <span className={styles.hostBadge}>👑 방장</span>}
                {isDev && isDevGuestUid(p.uid) && (
                  <span className={styles.devBadge}>DEV</span>
                )}
                {isDev && isDevGuestUid(p.uid) && room.status === 'waiting' && (
                  <button
                    className={styles.removeGuestBtn}
                    onClick={() => handleRemoveGuest(p.uid)}
                    disabled={devLoading}
                    title="게스트 제거"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {room.status === 'playing' ? (
          <div className={styles.statusMsg}>게임이 시작되었습니다!</div>
        ) : isHost ? (
          <>
            <button
              className={styles.primaryBtn}
              onClick={handleStart}
              disabled={!canStart || actionLoading}
            >
              {actionLoading ? '시작 중...' : '게임 시작'}
            </button>
            {playerCount < MIN_PLAYERS_TO_START && (
              <div className={styles.statusMsg}>2명 이상이 모이면 시작 가능</div>
            )}
          </>
        ) : (
          <div className={styles.statusMsg}>방장이 시작하기를 기다리는 중...</div>
        )}

        {isDev && room.status === 'waiting' && (
          <div className={styles.devSection}>
            <div className={styles.devSectionLabel}>🛠 개발 도구</div>
            <button
              className={styles.devGuestBtn}
              onClick={handleAddGuest}
              disabled={devLoading || playerCount >= room.maxPlayers}
            >
              + 게스트 추가
            </button>
            {playerCount >= room.maxPlayers && (
              <div className={styles.statusMsg}>최대 인원 도달</div>
            )}
          </div>
        )}

        <button
          className={styles.backBtn}
          onClick={handleLeave}
          disabled={actionLoading}
        >
          ← 방 나가기
        </button>
      </div>
    </div>
  )
}
