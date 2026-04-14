import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { createRoom, joinRoom } from '../utils/rtdb'
import type { RoomSettings, Player } from '../types'
import styles from './RoomEnter.module.css'

const DEFAULT_SETTINGS: RoomSettings = {
  rounds: 10,
  timerSeconds: 180,
  startCash: 1000000,
  companyMode: 'auto',
  companyCount: 5,
}

export default function RoomEnter() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const meAsPlayer: Player = {
    uid: user.uid,
    name: user.displayName ?? user.email ?? '플레이어',
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
      <button className={styles.backBtn} onClick={() => navigate('/')}>← 로비로</button>

      <div className={styles.card}>
        <h1 className={styles.title}>📈 주식 보드게임</h1>

        <div className={styles.tabs}>
          <button className={tab === 'create' ? styles.tabActive : styles.tab} onClick={() => setTab('create')}>방 만들기</button>
          <button className={tab === 'join' ? styles.tabActive : styles.tab} onClick={() => setTab('join')}>방 입장</button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {tab === 'create' ? (
          <div className={styles.form}>
            <label className={styles.label}>
              라운드 수
              <select className={styles.select} value={settings.rounds} onChange={e => setSettings(s => ({ ...s, rounds: +e.target.value }))}>
                {[5, 7, 10, 15].map(n => <option key={n} value={n}>{n}라운드</option>)}
              </select>
            </label>

            <label className={styles.label}>
              라운드 제한 시간
              <select className={styles.select} value={settings.timerSeconds} onChange={e => setSettings(s => ({ ...s, timerSeconds: +e.target.value }))}>
                <option value={60}>1분</option>
                <option value={120}>2분</option>
                <option value={180}>3분</option>
                <option value={300}>5분</option>
              </select>
            </label>

            <label className={styles.label}>
              시작 자금
              <select className={styles.select} value={settings.startCash} onChange={e => setSettings(s => ({ ...s, startCash: +e.target.value }))}>
                <option value={500000}>50만원</option>
                <option value={1000000}>100만원</option>
                <option value={2000000}>200만원</option>
              </select>
            </label>

            <label className={styles.label}>
              회사 수 모드
              <select className={styles.select} value={settings.companyMode} onChange={e => setSettings(s => ({ ...s, companyMode: e.target.value as 'auto' | 'manual' }))}>
                <option value="auto">자동 (인원 기반)</option>
                <option value="manual">수동</option>
              </select>
            </label>

            {settings.companyMode === 'manual' && (
              <label className={styles.label}>
                회사 수
                <select className={styles.select} value={settings.companyCount} onChange={e => setSettings(s => ({ ...s, companyCount: +e.target.value }))}>
                  {[4, 5, 6, 7].map(n => <option key={n} value={n}>{n}개</option>)}
                </select>
              </label>
            )}

            <button className={styles.primaryBtn} onClick={handleCreate} disabled={loading}>
              {loading ? '생성 중...' : '방 만들기'}
            </button>
          </div>
        ) : (
          <div className={styles.form}>
            <label className={styles.label}>
              방 코드 (6자리)
              <input
                className={styles.input}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="XXXXXX"
                maxLength={6}
              />
            </label>
            <button className={styles.primaryBtn} onClick={handleJoin} disabled={loading}>
              {loading ? '입장 중...' : '입장하기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
