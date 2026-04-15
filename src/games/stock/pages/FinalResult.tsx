import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom } from '../utils/rtdb'
import { ref, remove } from 'firebase/database'
import { rtdb } from '../../../firebase/config'
import type { Room, Player } from '../types'
import styles from './FinalResult.module.css'

// ── 순위 추이 그래프 ──────────────────────────────────────────────────────────
const RANK_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#a855f7','#14b8a6','#f97316']

function RankTrendChart({ room, playerCount }: { room: Room; playerCount: number }) {
  const totalRounds = room.settings.rounds
  const W = 480, H = 200
  const PAD = { top: 16, right: 16, bottom: 28, left: 28 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1)
  const players = Object.values(room.players)

  // 각 라운드별 rankSnapshot 수집
  const rankByRoundUid: Record<number, Record<string, number>> = {}
  for (const r of rounds) {
    const result = room.roundResults?.[r]
    if (!result) continue
    const snap: { uid: string; rank: number }[] = Array.isArray(result.rankSnapshot)
      ? result.rankSnapshot
      : Object.values(result.rankSnapshot ?? {})
    for (const s of snap) rankByRoundUid[r] = { ...(rankByRoundUid[r] ?? {}), [s.uid]: s.rank }
  }

  // 라운드 → X좌표, 순위 → Y좌표
  const xOf = (r: number) => PAD.left + ((r - 1) / Math.max(totalRounds - 1, 1)) * innerW
  const yOf = (rank: number) => PAD.top + ((rank - 1) / Math.max(playerCount - 1, 1)) * innerH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* 격자 */}
      {rounds.map(r => (
        <line key={r} x1={xOf(r)} y1={PAD.top} x2={xOf(r)} y2={PAD.top + innerH}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {Array.from({ length: playerCount }, (_, i) => i + 1).map(rank => (
        <line key={rank} x1={PAD.left} y1={yOf(rank)} x2={PAD.left + innerW} y2={yOf(rank)}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}

      {/* 축 라벨 */}
      {rounds.map(r => (
        <text key={r} x={xOf(r)} y={H - 6} textAnchor="middle"
          fontSize="9" fill="rgba(255,255,255,0.35)">{r}R</text>
      ))}
      {Array.from({ length: playerCount }, (_, i) => i + 1).map(rank => (
        <text key={rank} x={PAD.left - 4} y={yOf(rank) + 4} textAnchor="end"
          fontSize="9" fill="rgba(255,255,255,0.35)">{rank}위</text>
      ))}

      {/* 플레이어 선 */}
      {players.map((p, pi) => {
        const color = RANK_COLORS[pi % RANK_COLORS.length]
        const validRounds = rounds.filter(r => rankByRoundUid[r]?.[p.uid] !== undefined)
        if (validRounds.length < 2) return null
        const pts = validRounds.map(r => `${xOf(r)},${yOf(rankByRoundUid[r][p.uid])}`).join(' ')
        const lastR = validRounds[validRounds.length - 1]
        const lastRank = rankByRoundUid[lastR]?.[p.uid] ?? 0
        return (
          <g key={p.uid}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"
              opacity="0.85" />
            {validRounds.map(r => (
              <circle key={r} cx={xOf(r)} cy={yOf(rankByRoundUid[r][p.uid])} r="3"
                fill={color} opacity="0.9" />
            ))}
            <text x={xOf(lastR) + 5} y={yOf(lastRank) + 4}
              fontSize="9" fill={color} fontWeight="700">{p.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── 주가 스파크라인 (소형) ────────────────────────────────────────────────────
function PriceSparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null
  const W = 72, H = 28, PAD = 2
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = PAD + (i / (prices.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (p - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const up = prices[prices.length - 1] >= prices[0]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? '#4caf50' : '#f44336'}
        strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── 종목별 전체 주가 차트 ─────────────────────────────────────────────────────
function fmtPrice(p: number) {
  if (p >= 100000) return `${(p / 10000).toFixed(0)}만`
  if (p >= 10000) return `${(p / 10000).toFixed(1)}만`
  if (p >= 1000) return `${(p / 1000).toFixed(0)}천`
  return `${p}`
}

function CompanyPriceChart({ prices }: { prices: number[] }) {
  const W = 520, H = 140
  const PAD = { top: 12, right: 20, bottom: 24, left: 44 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const n = prices.length
  if (n < 2) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const xOf = (i: number) => PAD.left + (i / (n - 1)) * innerW
  const yOf = (p: number) => PAD.top + (1 - (p - min) / range) * innerH
  const pts = prices.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p).toFixed(1)}`).join(' ')
  const up = prices[n - 1] >= prices[0]
  const color = up ? '#4caf50' : '#f44336'
  const yTicks = [min, (min + max) / 2, max]
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {yTicks.map((t, ti) => (
        <line key={ti} x1={PAD.left} y1={yOf(t)} x2={PAD.left + innerW} y2={yOf(t)}
          stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      ))}
      {yTicks.map((t, ti) => (
        <text key={ti} x={PAD.left - 4} y={yOf(t) + 4} textAnchor="end"
          fontSize="9" fill="rgba(255,255,255,0.35)">{fmtPrice(t)}</text>
      ))}
      {prices.map((_, i) => (
        <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle"
          fontSize="9" fill="rgba(255,255,255,0.3)">{i === 0 ? '시작' : `${i}R`}</text>
      ))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {prices.map((p, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(p)} r="3" fill={color} opacity="0.85" />
      ))}
    </svg>
  )
}

interface PlayerResult {
  player: Player
  totalAssets: number
  rank: number
  cashChange: number
}

export default function FinalResult() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [showRankTrend, setShowRankTrend] = useState(false)
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) return
    const roomRef = subscribeRoom(roomId, r => {
      if (!r) { navigate('/game/stock-boardgame'); return }
      setRoom(r)
    })
    return () => unsubscribeRoom(roomRef)
  }, [roomId, navigate])

  // 잠깐 후 결과 공개 애니메이션
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 600)
    return () => clearTimeout(t)
  }, [])

  if (!room || !user) return <div className={styles.loading}>집계 중...</div>

  const totalRounds = room.settings.rounds
  const lastRoundPrices: Record<string, number> = {}
  for (const [id, company] of Object.entries(room.companies)) {
    lastRoundPrices[id] = company.priceHistory[totalRounds] ?? company.priceHistory[company.priceHistory.length - 1]
  }

  const results: PlayerResult[] = Object.values(room.players)
    .map(p => {
      const portfolioValue = Object.entries(p.portfolio ?? {}).reduce((sum, [cid, qty]) => {
        return sum + (lastRoundPrices[cid] ?? 0) * (qty as number)
      }, 0)
      const rawAssets = p.cash + portfolioValue
      const refillDeduction = p.refillTotal ?? 0
      const totalAssets = rawAssets - refillDeduction   // 파산구제 차감 후 최종 자산
      const cashChange = totalAssets - room.settings.startCash
      return { player: p, totalAssets, rank: p.rank || 0, cashChange }
    })
    .sort((a, b) => b.totalAssets - a.totalAssets)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  // ── 플레이어별 통계 계산 ──────────────────────────────────────────────────
  const playerStats = results.map(({ player, totalAssets, rank, cashChange }) => {
    const totalTax = Array.from({ length: totalRounds }, (_, i) => i + 1)
      .reduce((sum, r) => sum + (room.roundResults?.[r]?.taxApplied?.[player.uid] ?? 0), 0)
    const rankHistory = Array.from({ length: totalRounds }, (_, i) => i + 1)
      .map(r => {
        const snap = room.roundResults?.[r]?.rankSnapshot
        if (!snap) return null
        const arr: { uid: string; rank: number }[] = Array.isArray(snap) ? snap : Object.values(snap)
        return arr.find(s => s.uid === player.uid)?.rank ?? null
      })
      .filter((r): r is number => r !== null)
    const bestRank = rankHistory.length > 0 ? Math.min(...rankHistory) : rank
    const worstRank = rankHistory.length > 0 ? Math.max(...rankHistory) : rank
    const returnRate = ((totalAssets - room.settings.startCash) / room.settings.startCash) * 100
    return { player, rank, totalAssets, cashChange, totalTax, bestRank, worstRank, returnRate, refill: player.refillTotal ?? 0 }
  })

  const me = results.find(r => r.player.uid === user.uid)
  const winner = results[0]

  async function handleExit() {
    navigate('/game/stock-boardgame')
  }

  async function handleDeleteRoom() {
    if (!roomId || !rtdb) return
    try {
      await remove(ref(rtdb, `rooms/${roomId}`))
    } catch {
      // 이미 삭제됐을 수 있음
    }
    navigate('/game/stock-boardgame')
  }

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `${rank}위`
  }

  return (
    <div className={styles.page}>
      {/* 헤더 */}
      <div className={styles.header}>
        <h1 className={styles.title}>📈 최종 결과</h1>
        <p className={styles.subtitle}>{totalRounds}라운드 게임 종료</p>
      </div>

      <div className={styles.body}>
        {/* 우승자 배너 */}
        <div className={`${styles.winnerBanner} ${revealed ? styles.revealed : ''}`}>
          <div className={styles.winnerCrown}>👑</div>
          <div className={styles.winnerName}>{winner?.player.name}</div>
          <div className={styles.winnerAssets}>
            최종 자산: {winner?.totalAssets.toLocaleString()}원
          </div>
          {winner?.player.uid === user.uid && (
            <div className={styles.winnerYou}>🎉 당신이 우승했습니다!</div>
          )}
        </div>

        {/* 순위표 */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>최종 순위</h2>
          <div className={styles.rankList}>
            {results.map(({ player, totalAssets, rank, cashChange }, i) => {
              const isMe = player.uid === user.uid
              const delay = i * 120

              return (
                <div
                  key={player.uid}
                  className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''} ${revealed ? styles.rankRowIn : ''}`}
                  style={{ transitionDelay: `${delay}ms` }}
                >
                  <span className={styles.rankEmoji}>{rankEmoji(rank)}</span>
                  <div className={styles.playerInfo}>
                    {player.photoURL
                      ? <img src={player.photoURL} className={styles.avatar} alt="" />
                      : <div className={styles.avatarFb}>{player.name[0]}</div>
                    }
                    <span className={styles.playerName}>{player.name}</span>
                  </div>
                  <div className={styles.assetInfo}>
                    <span className={styles.totalAssets}>{totalAssets.toLocaleString()}원</span>
                    {(player.refillTotal ?? 0) > 0 && (
                      <span className={styles.refillNote}>구제 −{player.refillTotal.toLocaleString()}</span>
                    )}
                    <span
                      className={styles.cashChange}
                      style={{ color: cashChange >= 0 ? '#4caf50' : '#f44336' }}
                    >
                      {cashChange >= 0 ? '+' : ''}{cashChange.toLocaleString()}원
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 순위 추이 그래프 */}
        <div className={styles.card}>
          <button className={styles.trendToggle} onClick={() => setShowRankTrend(v => !v)}>
            {showRankTrend ? '▲ 순위 추이 닫기' : '📊 순위 추이 보기'}
          </button>
          {showRankTrend && (
            <div className={styles.trendChart}>
              <RankTrendChart room={room} playerCount={results.length} />
            </div>
          )}
        </div>

        {/* 종목별 주가 히스토리 */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>종목별 주가 히스토리 (클릭 시 차트)</h2>
          <div className={styles.stockList}>
            {Object.values(room.companies).map(c => {
              const prices = c.priceHistory
              const startPrice = prices[0]
              const endPrice = lastRoundPrices[c.id]
              const totalRate = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0
              const isExpanded = expandedCompany === c.id
              return (
                <div key={c.id}>
                  <div
                    className={`${styles.stockRow} ${styles.stockRowClickable} ${c.delisted ? styles.stockDelisted : ''}`}
                    onClick={() => setExpandedCompany(isExpanded ? null : c.id)}
                  >
                    <span className={styles.stockEmoji}>{c.emoji}</span>
                    <span className={styles.stockName}>
                      {c.name}
                      {c.delisted && <span className={styles.delistedTag}>상장폐지</span>}
                    </span>
                    <PriceSparkline prices={prices} />
                    <div className={styles.stockPrices}>
                      <span className={styles.stockEnd}>{endPrice.toLocaleString()}원</span>
                      <span
                        className={styles.stockTotal}
                        style={{ color: totalRate >= 0 ? '#4caf50' : '#f44336' }}
                      >
                        {totalRate >= 0 ? '+' : ''}{(totalRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className={styles.stockChartExpanded}>
                      <CompanyPriceChart prices={prices} />
                      <div className={styles.stockChartMeta}>
                        시작가 {startPrice.toLocaleString()}원 → 최종가 {endPrice.toLocaleString()}원
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 플레이어별 수익률 통계 */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>플레이어별 수익률 통계</h2>
          <div className={styles.statsTable}>
            <div className={styles.statsHeader}>
              <span className={styles.statsColRank}>순위</span>
              <span className={styles.statsColName}>이름</span>
              <span className={styles.statsColNum}>총수익률</span>
              <span className={styles.statsColNum}>세금납부</span>
              <span className={styles.statsColNum}>최고↔최저</span>
            </div>
            {playerStats.map(({ player, rank, returnRate, totalTax, bestRank, worstRank, refill }) => {
              const isMe = player.uid === user.uid
              return (
                <div key={player.uid} className={`${styles.statsRow} ${isMe ? styles.statsRowMe : ''}`}>
                  <span className={styles.statsColRank}>{rankEmoji(rank)}</span>
                  <span className={styles.statsColName}>
                    {player.name}
                    {refill > 0 && <span className={styles.statsRefillTag}>구제</span>}
                  </span>
                  <span
                    className={styles.statsColNum}
                    style={{ color: returnRate >= 0 ? '#4caf50' : '#f44336', fontWeight: 700 }}
                  >
                    {returnRate >= 0 ? '+' : ''}{returnRate.toFixed(1)}%
                  </span>
                  <span className={styles.statsColNum} style={{ color: 'rgba(255,255,255,0.45)' }}>
                    −{totalTax.toLocaleString()}원
                  </span>
                  <span className={styles.statsColNum}>
                    <span style={{ color: '#6366f1' }}>{bestRank}위</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>~</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{worstRank}위</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 내 결과 요약 */}
        {me && (
          <div className={styles.mySummary}>
            <div className={styles.mySummaryTitle}>내 최종 성적</div>
            <div className={styles.mySummaryRank}>{rankEmoji(me.rank)}</div>
            <div className={styles.mySummaryAssets}>{me.totalAssets.toLocaleString()}원</div>
            {(me.player.refillTotal ?? 0) > 0 && (
              <div className={styles.mySummaryRefill}>
                파산구제 차감: −{(me.player.refillTotal).toLocaleString()}원
              </div>
            )}
            <div
              className={styles.mySummaryChange}
              style={{ color: me.cashChange >= 0 ? '#4caf50' : '#f44336' }}
            >
              {me.cashChange >= 0 ? '+' : ''}{me.cashChange.toLocaleString()}원
              {' '}({me.cashChange >= 0 ? '+' : ''}{((me.cashChange / room.settings.startCash) * 100).toFixed(1)}%)
            </div>
          </div>
        )}

        {/* 버튼 */}
        <div className={styles.actions}>
          <button className={styles.exitBtn} onClick={handleExit}>로비로 돌아가기</button>
          {user.uid === room.host && (
            <button className={styles.deleteBtn} onClick={handleDeleteRoom}>방 삭제</button>
          )}
        </div>
      </div>
    </div>
  )
}
