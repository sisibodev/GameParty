import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, recordTrade, playSpecialCard, endRound } from '../utils/rtdb'
import { formatKRW, formatRate } from '../utils/scenario'
import { CARD_LABEL, CARD_COLOR, CARD_DESC } from '../utils/cards'
import type { Room, Company, Card } from '../types'
import styles from './GamePlay.module.css'

export default function GamePlay() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [tradeQty, setTradeQty] = useState(1)
  const [showRank, setShowRank] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [pendingCard, setPendingCard] = useState<Card | null>(null)  // 사용할 카드 선택 상태
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const roomRef = useRef<ReturnType<typeof subscribeRoom> | null>(null)

  useEffect(() => {
    if (!roomId) return
    roomRef.current = subscribeRoom(roomId, r => {
      if (!r) { navigate('/game/stock-boardgame'); return }
      if (r.status === 'round_result') {
        navigate(`/game/stock-boardgame/room/${roomId}/result`)
        return
      }
      if (r.status === 'ended') {
        navigate(`/game/stock-boardgame/room/${roomId}/final`)
        return
      }
      setRoom(r)

      // 타이머 동기화
      if (r.roundStartAt) {
        const elapsed = Math.floor((Date.now() - r.roundStartAt) / 1000)
        const remaining = Math.max(0, r.settings.timerSeconds - elapsed)
        setTimeLeft(remaining)
      }
    })
    return () => { if (roomRef.current) unsubscribeRoom(roomRef.current) }
  }, [roomId, navigate])

  // 카운트다운
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          // 방장이 라운드 종료 처리
          if (room && user && room.host === user.uid) {
            endRound(roomId!)
          }
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [room?.currentRound, roomId, user, room])

  // Tab 키 홀드 → 순위표
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Tab') { e.preventDefault(); setShowRank(true) } }
    const up = (e: KeyboardEvent) => { if (e.key === 'Tab') setShowRank(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const handleTrade = useCallback(async (action: 'buy' | 'sell') => {
    if (!room || !user || !selectedCompany || !roomId) return
    const me = room.players[user.uid]
    const company = room.companies[selectedCompany]
    const price = company.priceHistory[room.currentRound - 1] ?? company.priceHistory[0]

    if (action === 'buy') {
      const cost = price * tradeQty
      if (cost > me.cash) return
    } else {
      const holding = me.portfolio[selectedCompany] ?? 0
      if (holding < tradeQty) return
    }

    await recordTrade(roomId, room.currentRound, user.uid, selectedCompany, { action, quantity: tradeQty })
    setTradeQty(1)
  }, [room, user, selectedCompany, tradeQty, roomId])

  const handleUseSpecialCard = useCallback(async (card: Card) => {
    if (!room || !user || !roomId) return
    const me = room.players[user.uid]
    if (me.usedSpecialThisRound >= me.maxSpecialThisRound) return

    // 첫 번째 카드 이후 두 번째는 다른 회사에만 사용 가능 → 회사 선택 모달
    setPendingCard(card)
  }, [room, user, roomId])

  const confirmCardTarget = useCallback(async (companyId: string) => {
    if (!pendingCard || !room || !user || !roomId) return
    const me = room.players[user.uid]

    // 같은 회사에 이미 사용했는지 체크
    if (me.usedSpecialThisRound > 0) {
      const alreadyUsed = Object.values(room.cardPlays?.[room.currentRound] ?? {})
        .filter(p => p.userId === user.uid)
        .map(p => p.companyId)
      if (alreadyUsed.includes(companyId)) {
        alert('이미 이번 라운드에 이 회사에 카드를 사용했습니다.')
        return
      }
    }

    await playSpecialCard(roomId, room.currentRound, user.uid, companyId, pendingCard.id, pendingCard.type as string)
    setPendingCard(null)
  }, [pendingCard, room, user, roomId])

  if (!room || !user) return <div className={styles.loading}>로딩 중...</div>

  const me = room.players[user.uid]
  const companies = Object.values(room.companies)
  const selCompany = selectedCompany ? room.companies[selectedCompany] : null
  const selPrice = selCompany ? selCompany.priceHistory[room.currentRound - 1] ?? selCompany.priceHistory[0] : 0
  const mySpecialCards = me?.cards?.filter(c => c.category === 'special' && !c.used) ?? []
  const myInfoCards = me?.cards?.filter(c => c.category === 'info' && !c.used) ?? []
  const myHolding = selectedCompany ? (me?.portfolio?.[selectedCompany] ?? 0) : 0

  const timerPct = room.settings.timerSeconds > 0 ? timeLeft / room.settings.timerSeconds : 0
  const timerColor = timerPct > 0.4 ? '#4caf50' : timerPct > 0.15 ? '#ff9800' : '#f44336'

  const playersSorted = Object.values(room.players).sort((a, b) => a.rank - b.rank || b.cash - a.cash)

  // 드래프트 카드 (2라운드부터)
  const myDraftOptions = me?.draftOptions ?? []
  const draftChosen = me?.draftChosen

  return (
    <div className={styles.page}>
      {/* 상단 바 */}
      <div className={styles.topBar}>
        <span className={styles.roundLabel}>{room.currentRound} / {room.settings.rounds} 라운드</span>
        <div className={styles.timerWrap}>
          <div className={styles.timerBar} style={{ width: `${timerPct * 100}%`, background: timerColor }} />
          <span className={styles.timerText} style={{ color: timerColor }}>
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        </div>
        <span className={styles.cashLabel}>{formatKRW(me?.cash ?? 0)}</span>
      </div>

      <div className={styles.main}>
        {/* 종목 패널 */}
        <div className={styles.companiesPanel}>
          {companies.map(c => {
            const curPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
            const prevPrice = c.priceHistory[room.currentRound - 2] ?? c.priceHistory[0]
            const change = prevPrice > 0 ? (curPrice - prevPrice) / prevPrice : 0
            const holding = me?.portfolio?.[c.id] ?? 0
            return (
              <div
                key={c.id}
                className={`${styles.companyRow} ${selectedCompany === c.id ? styles.companyRowSelected : ''}`}
                onClick={() => setSelectedCompany(c.id)}
              >
                <span className={styles.companyEmoji}>{c.emoji}</span>
                <div className={styles.companyInfo}>
                  <span className={styles.companyName}>{c.name}</span>
                  {holding > 0 && <span className={styles.holdingBadge}>{holding}주</span>}
                </div>
                <div className={styles.priceInfo}>
                  <span className={styles.price}>{curPrice.toLocaleString()}</span>
                  <span className={styles.change} style={{ color: change >= 0 ? '#4caf50' : '#f44336' }}>
                    {formatRate(change)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 차트 + 매매 패널 */}
        <div className={styles.rightPanel}>
          {/* 선택 종목 차트 */}
          <div className={styles.chartArea}>
            {selCompany ? (
              <MiniChart company={selCompany} currentRound={room.currentRound} />
            ) : (
              <div className={styles.chartPlaceholder}>종목을 선택하세요</div>
            )}
          </div>

          {/* 매매 */}
          <div className={styles.tradeArea}>
            {selCompany ? (
              <>
                <div className={styles.tradeHeader}>
                  <span>{selCompany.emoji} {selCompany.name}</span>
                  <span className={styles.tradePrice}>{formatKRW(selPrice)}</span>
                </div>
                <div className={styles.qtyRow}>
                  <button className={styles.qtyBtn} onClick={() => setTradeQty(q => Math.max(1, q - 10))}>-10</button>
                  <button className={styles.qtyBtn} onClick={() => setTradeQty(q => Math.max(1, q - 1))}>-1</button>
                  <input
                    type="number"
                    className={styles.qtyInput}
                    value={tradeQty}
                    min={1}
                    onChange={e => {
                      const v = parseInt(e.target.value)
                      if (!isNaN(v) && v >= 1) setTradeQty(v)
                    }}
                  />
                  <button className={styles.qtyBtn} onClick={() => setTradeQty(q => q + 1)}>+1</button>
                  <button className={styles.qtyBtn} onClick={() => setTradeQty(q => q + 10)}>+10</button>
                </div>
                <div className={styles.qtyShortcuts}>
                  <button
                    className={styles.qtyShortBtn}
                    onClick={() => setTradeQty(Math.max(1, Math.floor((me?.cash ?? 0) / selPrice)))}
                    disabled={selPrice === 0 || (me?.cash ?? 0) < selPrice}
                  >
                    최대 매수
                  </button>
                  <button
                    className={styles.qtyShortBtn}
                    onClick={() => setTradeQty(Math.max(1, myHolding))}
                    disabled={myHolding === 0}
                  >
                    전부 매도
                  </button>
                </div>
                <div className={styles.tradeBtns}>
                  <button className={styles.buyBtn} onClick={() => handleTrade('buy')}
                    disabled={selPrice * tradeQty > (me?.cash ?? 0)}>
                    매수 {formatKRW(selPrice * tradeQty)}
                  </button>
                  <button className={styles.sellBtn} onClick={() => handleTrade('sell')}
                    disabled={myHolding < tradeQty}>
                    매도 ({myHolding}주 보유)
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.tradePlaceholder}>종목을 선택하면 매매할 수 있습니다</div>
            )}
          </div>

          {/* 카드 영역 */}
          <div className={styles.cardSection}>
            {/* 특수 카드 */}
            {mySpecialCards.length > 0 && (
              <div className={styles.cardGroup}>
                <span className={styles.cardGroupLabel}>
                  특수 카드 ({me.usedSpecialThisRound}/{me.maxSpecialThisRound})
                </span>
                <div className={styles.cardList}>
                  {mySpecialCards.map(card => (
                    <button
                      key={card.id}
                      className={styles.cardBtn}
                      style={{ borderColor: CARD_COLOR[card.type] ?? '#666' }}
                      onClick={() => handleUseSpecialCard(card)}
                      disabled={me.usedSpecialThisRound >= me.maxSpecialThisRound}
                      title={CARD_DESC[card.type]}
                    >
                      {CARD_LABEL[card.type]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 정보 카드 */}
            {myInfoCards.length > 0 && (
              <div className={styles.cardGroup}>
                <span className={styles.cardGroupLabel}>
                  정보 카드 ({me.usedInfoThisRound}/{me.maxInfoThisRound})
                </span>
                <div className={styles.cardList}>
                  {myInfoCards.map(card => (
                    <button
                      key={card.id}
                      className={styles.cardBtn}
                      style={{ borderColor: '#2196f3' }}
                      title={CARD_DESC[card.type]}
                    >
                      {CARD_LABEL[card.type]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 드래프트 (2라운드부터) */}
            {room.currentRound >= 2 && myDraftOptions.length > 0 && !draftChosen && (
              <div className={styles.draftArea}>
                <span className={styles.cardGroupLabel}>드래프트 — 1장을 보관하세요</span>
                <div className={styles.cardList}>
                  {myDraftOptions.map((opt: unknown) => {
                    const card = opt as Card
                    return (
                      <button
                        key={card.id}
                        className={`${styles.cardBtn} ${styles.draftBtn}`}
                        title={CARD_DESC[card.type]}
                        onClick={async () => {
                          if (!roomId || !user) return
                          const { chooseDraft } = await import('../utils/rtdb')
                          await chooseDraft(roomId, room.currentRound, user.uid, card.id)
                        }}
                      >
                        {CARD_LABEL[card.type]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 순위표 오버레이 (Tab 홀드) */}
      {showRank && (
        <div className={styles.rankOverlay}>
          <h3>📊 현재 순위</h3>
          {playersSorted.map((p, i) => (
            <div key={p.uid} className={`${styles.rankRow} ${p.uid === user.uid ? styles.rankRowMe : ''}`}>
              <span className={styles.rankNum}>{i + 1}위</span>
              <span className={styles.rankName}>{p.name}</span>
            </div>
          ))}
          <p className={styles.rankHint}>Tab 키에서 손을 떼면 사라집니다</p>
        </div>
      )}

      {/* 카드 대상 선택 모달 */}
      {pendingCard && (
        <div className={styles.modalOverlay} onClick={() => setPendingCard(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>{CARD_LABEL[pendingCard.type]} — 대상 회사 선택</h3>
            <p className={styles.modalDesc}>{CARD_DESC[pendingCard.type]}</p>
            <div className={styles.modalCompanies}>
              {companies.map(c => {
                const usedOnThis = Object.values(room.cardPlays?.[room.currentRound] ?? {})
                  .filter(p => p.userId === user.uid && p.companyId === c.id).length > 0
                return (
                  <button
                    key={c.id}
                    className={styles.modalCompanyBtn}
                    onClick={() => confirmCardTarget(c.id)}
                    disabled={usedOnThis}
                  >
                    {c.emoji} {c.name} {usedOnThis ? '(사용됨)' : ''}
                  </button>
                )
              })}
            </div>
            <button className={styles.modalCancel} onClick={() => setPendingCard(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 방장 강제 종료 버튼 */}
      {user.uid === room.host && (
        <button className={styles.endBtn} onClick={() => endRound(roomId!)}>
          라운드 종료
        </button>
      )}
    </div>
  )
}

// ─── 미니 차트 ─────────────────────────────────────────────────────────────────

function MiniChart({ company, currentRound }: { company: Company; currentRound: number }) {
  const visible = company.priceHistory.slice(0, currentRound)
  if (visible.length < 2) return <div className={styles.chartPlaceholder}>데이터 없음</div>

  const min = Math.min(...visible)
  const max = Math.max(...visible)
  const range = max - min || 1
  const W = 300, H = 100, PAD = 8

  const pts = visible.map((p, i) => {
    const x = PAD + (i / (visible.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((p - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const lastRate = visible.length >= 2
    ? (visible[visible.length - 1] - visible[visible.length - 2]) / visible[visible.length - 2]
    : 0

  return (
    <div className={styles.chartSvgWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} preserveAspectRatio="none">
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke={lastRate >= 0 ? '#4caf50' : '#f44336'}
          strokeWidth="2"
        />
      </svg>
      <div className={styles.chartMeta}>
        <span>{company.name}</span>
        <span style={{ color: lastRate >= 0 ? '#4caf50' : '#f44336' }}>{formatRate(lastRate)}</span>
      </div>
    </div>
  )
}
