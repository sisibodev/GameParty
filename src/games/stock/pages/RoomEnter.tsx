import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { createRoom, joinRoom, subscribeRooms, unsubscribeRoom } from '../utils/rtdb'
import type { RoomSettings, Player, Room } from '../types'
import styles from './RoomEnter.module.css'

const DEFAULT_SETTINGS: RoomSettings = {
  rounds: 10,
  timerSeconds: 180,
  startCash: 1000000,
  companyMode: 'auto',
  companyCount: 5,
}

const TONE_COLORS: Record<string, string> = {
  a: 'linear-gradient(135deg, #ff4d5e, #ff7788)',
  b: 'linear-gradient(135deg, #3b82f6, #6ba7ff)',
  c: 'linear-gradient(135deg, #4ade80, #86efac)',
  d: 'linear-gradient(135deg, #ffc857, #ffd97e)',
  e: 'linear-gradient(135deg, #9d7aff, #b79bff)',
  f: 'linear-gradient(135deg, #5de3ff, #8eecff)',
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: TONE_COLORS['e'],
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 800, color: '#0a0b12',
      flexShrink: 0, border: '2px solid rgba(255,255,255,0.12)',
    }}>
      {name?.[0] ?? '?'}
    </div>
  )
}

function DecorativeCard({
  emoji, title, effect, color, rotate, top, left, zIndex = 1,
}: {
  emoji: string; title: string; effect: string
  color: string; rotate: number; top: number; left: number; zIndex?: number
}) {
  return (
    <div style={{
      position: 'absolute', top, left, zIndex,
      width: 112, height: 160, borderRadius: 12,
      background: `linear-gradient(180deg, ${color}22, rgba(0,0,0,0.3))`,
      border: `1.5px solid ${color}`,
      padding: 8,
      display: 'flex', flexDirection: 'column',
      transform: `rotate(${rotate}deg)`,
      boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 20px ${color}44`,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>SPECIAL</div>
      <div style={{ fontSize: 28, textAlign: 'center', lineHeight: 1 }}>{emoji}</div>
      <div style={{ fontSize: 14, fontWeight: 800, textAlign: 'center', color: '#f1f3ff', marginTop: 4 }}>{title}</div>
      <div style={{ fontSize: 11, color: '#9098b7', textAlign: 'center', marginTop: 4, lineHeight: 1.3, flex: 1 }}>{effect}</div>
    </div>
  )
}

export default function RoomEnter() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    const ref = subscribeRooms(setRooms)
    return () => unsubscribeRoom(ref)
  }, [])

  if (!user) return null

  const displayName = user.displayName ?? user.email ?? '플레이어'

  const meAsPlayer: Player = {
    uid: user.uid,
    name: displayName,
    photoURL: user.photoURL ?? '',
    ready: false,
    cash: settings.startCash,
    portfolio: {},
    cards: [],
    rank: 0,
    usedSpecialThisRound: 0,
    usedInfoThisRound: 0,
    maxSpecialThisRound: 2,
    maxInfoThisRound: 1,
    draftChosen: null,
    refillTotal: 0,
  }

  async function handleCreate() {
    setLoading(true)
    setError(null)
    try {
      const roomId = await createRoom(meAsPlayer, settings)
      navigate(`/game/stock-boardgame/room/${roomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 생성 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) { setError('방 코드를 입력하세요.'); return }
    setLoading(true)
    setError(null)
    try {
      await joinRoom(joinCode.trim().toUpperCase(), meAsPlayer)
      navigate(`/game/stock-boardgame/room/${joinCode.trim().toUpperCase()}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 입장 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      {/* ── Top nav ── */}
      <nav className={styles.nav}>
        <div className={styles.navLeft}>
          <div className={styles.logo}>📈</div>
          <div>
            <div className={styles.logoTitle}>GameParty</div>
            <div className={styles.logoSub}>멀티플레이어 보드게임</div>
          </div>
        </div>
        <div className={styles.navRight}>
          <button className={styles.backBtn} onClick={() => navigate('/')}>← 홈으로</button>
          <div className={styles.userChip}>
            <Avatar name={displayName} size={28} />
            <span className={styles.userName}>{displayName}</span>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className={styles.hero}>
        {/* Left column */}
        <div className={styles.heroLeft}>
          <div className={styles.badge}>🏆 주식 보드게임</div>

          <h1 className={styles.heroTitle}>
            주식 보드게임<br />
            <span className={styles.heroGradient}>Stock Tycoon</span>
          </h1>

          <p className={styles.heroDesc}>
            4~10명이 함께 10라운드 동안 주식을 사고팔아 최고의 투자자가 되세요.
            특수 카드로 상대를 방해하고, 정보 카드로 시장을 읽으세요.
          </p>

          {/* ── Form panel ── */}
          <div className={styles.formPanel}>
            <div className={styles.tabs}>
              <button
                className={tab === 'create' ? styles.tabActive : styles.tab}
                onClick={() => { setTab('create'); setError(null) }}
              >
                🎮 방 만들기
              </button>
              <button
                className={tab === 'join' ? styles.tabActive : styles.tab}
                onClick={() => { setTab('join'); setError(null) }}
              >
                🔗 방 입장
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {tab === 'create' ? (
              <div className={styles.form}>
                <div className={styles.formGrid}>
                  <label className={styles.label}>
                    <span className={styles.labelText}>라운드 수</span>
                    <select
                      className={styles.select}
                      value={settings.rounds}
                      onChange={e => setSettings(s => ({ ...s, rounds: +e.target.value }))}
                    >
                      {[5, 7, 10, 15].map(n => <option key={n} value={n}>{n}라운드</option>)}
                    </select>
                  </label>

                  <label className={styles.label}>
                    <span className={styles.labelText}>라운드 제한 시간</span>
                    <select
                      className={styles.select}
                      value={settings.timerSeconds}
                      onChange={e => setSettings(s => ({ ...s, timerSeconds: +e.target.value }))}
                    >
                      <option value={60}>1분</option>
                      <option value={120}>2분</option>
                      <option value={180}>3분</option>
                      <option value={300}>5분</option>
                    </select>
                  </label>

                  <label className={styles.label}>
                    <span className={styles.labelText}>시작 자금</span>
                    <select
                      className={styles.select}
                      value={settings.startCash}
                      onChange={e => setSettings(s => ({ ...s, startCash: +e.target.value }))}
                    >
                      <option value={500000}>50만원</option>
                      <option value={1000000}>100만원</option>
                      <option value={2000000}>200만원</option>
                    </select>
                  </label>

                  <label className={styles.label}>
                    <span className={styles.labelText}>회사 수 모드</span>
                    <select
                      className={styles.select}
                      value={settings.companyMode}
                      onChange={e => setSettings(s => ({ ...s, companyMode: e.target.value as 'auto' | 'manual' }))}
                    >
                      <option value="auto">자동 (인원 기반)</option>
                      <option value="manual">수동</option>
                    </select>
                  </label>

                  {settings.companyMode === 'manual' && (
                    <label className={styles.label}>
                      <span className={styles.labelText}>회사 수</span>
                      <select
                        className={styles.select}
                        value={settings.companyCount}
                        onChange={e => setSettings(s => ({ ...s, companyCount: +e.target.value }))}
                      >
                        {[4, 5, 6, 7].map(n => <option key={n} value={n}>{n}개</option>)}
                      </select>
                    </label>
                  )}
                </div>

                <button className={styles.primaryBtn} onClick={handleCreate} disabled={loading}>
                  {loading ? '생성 중...' : '🚀 방 만들기'}
                </button>
              </div>
            ) : (
              <div className={styles.form}>
                <label className={styles.label}>
                  <span className={styles.labelText}>방 코드 (6자리)</span>
                  <input
                    className={styles.input}
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    maxLength={6}
                  />
                </label>
                <button className={styles.primaryBtn} onClick={handleJoin} disabled={loading}>
                  {loading ? '입장 중...' : '🔗 입장하기'}
                </button>
              </div>
            )}
          </div>

          <div className={styles.gameInfo}>
            <span>👥 4-10인</span>
            <span>⏱ 약 25분</span>
            <span>🎯 난이도 ★★★☆☆</span>
          </div>
        </div>

        {/* Right column — decorative cards */}
        <div className={styles.heroRight}>
          <DecorativeCard
            emoji="🚀" title="급등" effect="+30% 1개 회사"
            color="#ff4d5e" rotate={-8} top={20} left={40}
          />
          <DecorativeCard
            emoji="📰" title="내부자 정보" effect="다음 라운드 카드 1장 미리 보기"
            color="#4ade80" rotate={4} top={70} left={140} zIndex={2}
          />
          <DecorativeCard
            emoji="💥" title="폭락" effect="-30% 1개 회사"
            color="#3b82f6" rotate={10} top={20} left={250}
          />
          <DecorativeCard
            emoji="🌐" title="경기 호황" effect="전 종목 +10%"
            color="#9d7aff" rotate={-4} top={210} left={90}
          />
        </div>
      </div>

      {/* ── Room list ── */}
      <div className={styles.roomSection}>
        <div className={styles.roomSectionHeader}>
          <h3 className={styles.roomSectionTitle}>🔥 대기 중인 방</h3>
          <span className={styles.roomCount}>{rooms.length}개</span>
        </div>
        {rooms.length === 0 ? (
          <div className={styles.roomEmpty}>현재 대기 중인 방이 없습니다. 새 방을 만들어보세요!</div>
        ) : (
          <div className={styles.roomGrid}>
            {rooms.map(room => {
              const players = Object.values(room.players ?? {})
              const host = players.find(p => p.uid === room.host)
              return (
                <div key={room.host} className={styles.roomCard}>
                  <div className={styles.roomCardTop}>
                    <div className={styles.roomHostName}>{host?.name ?? '—'} 의 방</div>
                  </div>
                  <div className={styles.roomCardMeta}>
                    <span>{room.settings.rounds}라운드</span>
                    <span>·</span>
                    <span>{room.settings.timerSeconds / 60}분</span>
                    <span>·</span>
                    <span>시작금 {(room.settings.startCash / 10000).toFixed(0)}만원</span>
                  </div>
                  <div className={styles.roomCardBottom}>
                    <span className={styles.roomPlayerCount}>👥 {players.length}명 대기 중</span>
                    <button
                      className={styles.roomJoinBtn}
                      onClick={() => {
                        setJoinCode(room.host)
                        setTab('join')
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      입장
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
