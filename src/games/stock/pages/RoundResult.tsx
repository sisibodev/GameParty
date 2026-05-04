import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, calculateRoundResult, nextRound } from '../utils/rtdb'
import { formatRate } from '../utils/scenario'
import { CARD_LABEL, CARD_DESC, CARD_COLOR, ROUND_CARD_META } from '../utils/cards'
import type { Room, CardPlay, RoundCardType } from '../types'
import styles from './RoundResult.module.css'

// ── 클라이언트 사이드 카드 효과 재계산 ───────────────────────────────────────

function applySpecialCard(
  rates: Record<string, number>,
  cardType: string,
  companyId: string,
): Record<string, number> {
  const r = { ...rates }
  const v = r[companyId] ?? 0
  switch (cardType) {
    case 'surge':       r[companyId] = v + 0.20; break
    case 'drop':        r[companyId] = v - 0.20; break
    case 'small_surge': r[companyId] = v + 0.10; break
    case 'small_drop':  r[companyId] = v - 0.10; break
    case 'boom':        r[companyId] = v * 2;    break
    case 'crash':       r[companyId] = v * 0.5;  break
    case 'reversal':    r[companyId] = -v;        break
  }
  return r
}

// ── 스파크라인 차트 ───────────────────────────────────────────────────────────

function SparklineChart({ prices, width, height = 40 }: { prices: number[]; width?: number; height?: number }) {
  const VW = 100  // internal viewBox width
  const H  = height
  const pad = 3
  if (prices.length < 2) {
    return width
      ? <svg width={width} height={H} />
      : <svg viewBox={`0 0 ${VW} ${H}`} width="100%" height={H} />
  }
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (VW - pad * 2)
    const y = pad + (1 - (p - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const isUp = prices[prices.length - 1] >= prices[0]
  const color = isUp ? '#4caf50' : '#f44336'
  const fillPts = `${pts[0].split(',')[0]},${H - pad} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${H - pad}`
  const svgProps = width
    ? { width, height: H }
    : { viewBox: `0 0 ${VW} ${H}`, width: '100%' as const, height: H }
  return (
    <svg {...svgProps} className={styles.sparkline}>
      <polygon points={fillPts} fill={color} opacity={0.15} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── 카드 뒷면 SVG ────────────────────────────────────────────────────────────

function CardBack({ variant = 'special' }: { variant?: 'special' | 'round' }) {
  return (
    <div className={`${styles.cardBack} ${variant === 'round' ? styles.cardBackRound : ''}`}>
      <svg viewBox="0 0 80 110" className={styles.cardBackSvg} preserveAspectRatio="xMidYMid meet">
        {/* 격자 */}
        {[20, 40, 60, 80].map(y => (
          <line key={y} x1="4" y1={y} x2="76" y2={y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
        ))}
        {[20, 40, 60].map(x => (
          <line key={x} x1={x} y1="4" x2={x} y2="106"
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
        ))}
        {/* 캔들스틱 */}
        <line x1="12" y1="30" x2="12" y2="80" stroke="#ef535066" strokeWidth="1.2"/>
        <rect x="9" y="42" width="6" height="26" fill="#ef535088" rx="0.8"/>

        <line x1="28" y1="35" x2="28" y2="78" stroke="#ef535066" strokeWidth="1.2"/>
        <rect x="25" y="48" width="6" height="22" fill="#ef535088" rx="0.8"/>

        <line x1="44" y1="24" x2="44" y2="68" stroke="#4caf5066" strokeWidth="1.2"/>
        <rect x="41" y="30" width="6" height="26" fill="#4caf5088" rx="0.8"/>

        <line x1="60" y1="16" x2="60" y2="60" stroke="#4caf5066" strokeWidth="1.2"/>
        <rect x="57" y="22" width="6" height="24" fill="#4caf5088" rx="0.8"/>

        {/* 추세선 */}
        <polyline
          points="12,65 28,62 44,48 60,35"
          fill="none" stroke="rgba(255,193,7,0.5)" strokeWidth="1.5" strokeDasharray="3,2"
        />
      </svg>
      <div className={styles.cardBackIcon}>
        {variant === 'round' ? '🌐' : '📈'}
      </div>
      <div className={styles.cardBackCornerTL}>?</div>
      <div className={styles.cardBackCornerBR}>?</div>
    </div>
  )
}

// ── 특수카드 컴포넌트 ────────────────────────────────────────────────────────

function SpecialCardItem({
  play, company, flipped, highlight,
}: {
  play: CardPlay
  company: { name: string; emoji: string } | undefined
  flipped: boolean
  highlight: boolean
}) {
  const color = CARD_COLOR[play.cardType] ?? '#666'
  return (
    <div className={`${styles.cardWrap} ${highlight ? styles.cardHighlight : ''}`}>
      <div className={`${styles.cardFlip} ${flipped ? styles.flipped : ''}`}>
        <CardBack variant="special" />
        <div className={styles.cardFront} style={{ borderColor: color }}>
          <div className={styles.cardFrontType} style={{ color }}>
            {CARD_LABEL[play.cardType] ?? play.cardType}
          </div>
          <div className={styles.cardFrontDesc}>{CARD_DESC[play.cardType] ?? ''}</div>
          {company && (
            <div className={styles.cardFrontTarget}>
              {company.emoji} {company.name}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 라운드카드 컴포넌트 ──────────────────────────────────────────────────────

function RoundCardItem({ cardType, flipped }: { cardType: RoundCardType; flipped: boolean }) {
  const meta = ROUND_CARD_META[cardType]
  return (
    <div className={styles.roundCardWrap}>
      <div className={`${styles.roundCardFlip} ${flipped ? styles.flipped : ''}`}>
        <CardBack variant="round" />
        <div className={styles.roundCardFront} style={{ borderColor: meta?.color ?? '#fff' }}>
          <div className={styles.roundCardLabel} style={{ color: meta?.color ?? '#fff' }}>
            이번 라운드 이벤트
          </div>
          <div className={styles.roundCardName}>{meta?.label ?? cardType}</div>
          <div className={styles.roundCardDesc}>{meta?.desc ?? ''}</div>
        </div>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────

type Phase = 'calculating' | 'base' | 'special_cards' | 'round_card' | 'done'

export default function RoundResult() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [calculated, setCalculated] = useState(false)
  const calcRef = useRef(false)

  const [phase, setPhase] = useState<Phase>('calculating')
  const [cardIndex, setCardIndex] = useState(0)
  const [flippedSpecials, setFlippedSpecials] = useState<Set<number>>(new Set())
  const [roundCardFlipped, setRoundCardFlipped] = useState(false)
  const [displayRates, setDisplayRates] = useState<Record<string, number>>({})
  const [highlightCard, setHighlightCard] = useState(-1)

  // ── 방 구독
  useEffect(() => {
    if (!roomId) return
    const roomRef = subscribeRoom(roomId, r => {
      if (!r) { navigate('/game/stock-boardgame'); return }
      if (r.status === 'playing') { navigate(`/game/stock-boardgame/room/${roomId}/play`); return }
      if (r.status === 'ended')   { navigate(`/game/stock-boardgame/room/${roomId}/final`); return }
      setRoom(r)

      if (r.status === 'round_result' && !r.roundResults?.[r.currentRound]
        && !calcRef.current && user?.uid === r.host) {
        calcRef.current = true
        calculateRoundResult(roomId, r.currentRound)
          .then(() => setCalculated(true))
          .catch(console.error)
      } else if (r.roundResults?.[r.currentRound]) {
        setCalculated(true)
      }
    })
    return () => unsubscribeRoom(roomRef)
  }, [roomId, navigate, user])

  // ── 계산 완료 → 애니메이션 시작
  useEffect(() => {
    if (!calculated || !room) return
    const result = room.roundResults?.[room.currentRound]
    if (!result) return

    setDisplayRates(result.baseRates ?? result.finalRates)
    setPhase('base')
  }, [calculated, room])

  // ── Phase: base → special_cards 전환
  useEffect(() => {
    if (phase !== 'base') return
    const t = setTimeout(() => setPhase('special_cards'), 1200)
    return () => clearTimeout(t)
  }, [phase])

  // ── Phase: special_cards — 카드 한 장씩 공개
  useEffect(() => {
    if (phase !== 'special_cards' || !room) return
    const result = room.roundResults?.[room.currentRound]
    if (!result) return

    const cardPlays = Object.values(room.cardPlays?.[room.currentRound] ?? {})

    if (cardIndex >= cardPlays.length) {
      // 특수카드 다 공개 → 라운드카드로
      const t = setTimeout(() => setPhase('round_card'), 600)
      return () => clearTimeout(t)
    }

    const play = cardPlays[cardIndex]

    // 300ms 후 카드 플립
    const t1 = setTimeout(() => {
      setHighlightCard(cardIndex)
      setFlippedSpecials(prev => new Set([...prev, cardIndex]))

      // 플립 중반(350ms)에 수치 갱신
      const t2 = setTimeout(() => {
        setDisplayRates(prev => applySpecialCard(prev, play.cardType, play.companyId))
      }, 380)

      // 1.2초 후 다음 카드
      const t3 = setTimeout(() => {
        setHighlightCard(-1)
        setCardIndex(i => i + 1)
      }, 1300)

      return () => { clearTimeout(t2); clearTimeout(t3) }
    }, 350)

    return () => clearTimeout(t1)
  }, [phase, cardIndex, room])

  // ── Phase: round_card
  useEffect(() => {
    if (phase !== 'round_card' || !room) return
    const result = room.roundResults?.[room.currentRound]
    if (!result) return

    // 700ms 후 라운드카드 플립
    const t1 = setTimeout(() => {
      setRoundCardFlipped(true)

      // 플립 중반에 모든 수치를 최종값으로
      const t2 = setTimeout(() => {
        setDisplayRates(result.finalRates)
      }, 380)

      // 1.4초 후 완료
      const t3 = setTimeout(() => {
        setPhase('done')
      }, 1500)

      return () => { clearTimeout(t2); clearTimeout(t3) }
    }, 700)

    return () => clearTimeout(t1)
  }, [phase, room])

  // ─────────────────────────────────────────────────────────────────────────

  if (!room || !user) return <div className={styles.loading}>계산 중...</div>

  if (!calculated) {
    return (
      <div className={styles.page}>
        <div className={styles.calculating}>
          <div className={styles.spinner} />
          <p>라운드 결과 계산 중...</p>
        </div>
      </div>
    )
  }

  const result = room.roundResults?.[room.currentRound]
  if (!result) return <div className={styles.loading}>계산 중...</div>

  const companies = Object.values(room.companies)
  const me = room.players[user.uid]
  const isHost = room.host === user.uid
  const isLastRound = room.currentRound >= room.settings.rounds
  const cardPlays = Object.values(room.cardPlays?.[room.currentRound] ?? {})
  const playersSorted = [...result.rankSnapshot].sort((a, b) => a.rank - b.rank)

  // 포트폴리오 수익 계산
  const myPortfolio = companies
    .map(c => {
      const holding = me?.portfolio?.[c.id] ?? 0
      const prevPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
      const newPrice = c.priceHistory[room.currentRound] ?? prevPrice
      const roundPnl = holding * (newPrice - prevPrice)
      const rate = prevPrice > 0 ? (newPrice - prevPrice) / prevPrice : 0
      const value = holding * newPrice
      return { company: c, holding, prevPrice, newPrice, roundPnl, rate, value }
    })
    .filter(p => p.holding > 0)

  const portfolioValue = companies.reduce((sum, c) => {
    const holding = me?.portfolio?.[c.id] ?? 0
    const newPrice = c.priceHistory[room.currentRound] ?? c.priceHistory[room.currentRound - 1] ?? 0
    return sum + holding * newPrice
  }, 0)
  const totalAssets = (me?.cash ?? 0) + portfolioValue
  const totalRoundPnl = myPortfolio.reduce((sum, p) => sum + p.roundPnl, 0)

  async function handleNext() {
    if (!roomId) return
    await nextRound(roomId, room!.currentRound + 1, room!.settings.rounds)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.roundBadge}>
          {room.currentRound} / {room.settings.rounds} 라운드 결과
        </span>
      </div>

      <div className={styles.threeCol}>

        {/* ── 왼쪽: 회사별 가격 추이 그래프 ───────────────── */}
        <div className={styles.colLeft}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>가격 추이</h3>
            <div className={styles.sparklineList}>
              {companies.map(c => {
                const priceArr: number[] = Array.isArray(c.priceHistory)
                  ? c.priceHistory
                  : Object.values(c.priceHistory as Record<string, number>)
                const sparkPrices = priceArr.slice(0, room.currentRound + 1)
                return (
                  <div key={c.id} className={styles.sparklineItem}>
                    <span className={styles.sparklineName}>{c.emoji} {c.name}</span>
                    <SparklineChart prices={sparkPrices} height={44} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── 가운데: 주가 변동 + 카드 연출 + 순위 + 버튼 ─── */}
        <div className={styles.colCenter}>
          {/* 주가 변동 (회사명 · 수익률 · 최종가격) */}
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>주가 변동</h3>
            <div className={styles.priceInfoList}>
              {companies.map(c => {
                const isDelisted = result.delistedCompanies?.includes(c.id)
                const rate = isDelisted ? -1 : (displayRates[c.id] ?? 0)
                const prevPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
                const displayPrice = isDelisted ? 0 : Math.max(100, Math.round(prevPrice * (1 + rate)))
                const companyCards = cardPlays.filter(p => p.companyId === c.id)
                return (
                  <div key={c.id} className={`${styles.priceInfoRow} ${isDelisted ? styles.priceInfoRowDelisted : ''}`}>
                    <div className={styles.priceInfoRowMain}>
                      <span className={styles.priceInfoName}>{c.emoji} {c.name}</span>
                      {isDelisted ? (
                        <span className={styles.delistedBadge}>상장폐지</span>
                      ) : (
                        <>
                          <span className={styles.priceInfoArrow}>
                            {prevPrice.toLocaleString()} → <span className={styles.priceAfter}>{displayPrice.toLocaleString()}원</span>
                          </span>
                          <span className={`${styles.priceInfoRate} ${rate >= 0 ? styles.priceInfoRateBull : styles.priceInfoRateBear}`}>
                            {formatRate(rate)}
                          </span>
                        </>
                      )}
                    </div>
                    {companyCards.length > 0 && (
                      <div className={styles.priceInfoCardTags}>
                        {companyCards.map(p => (
                          <span key={p.playId} className={styles.cardTag}
                            style={{ borderColor: `${CARD_COLOR[p.cardType] ?? '#fff'}33`, color: CARD_COLOR[p.cardType] ?? '#9098b7' }}>
                            {CARD_LABEL[p.cardType] ?? p.cardType}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {/* 특수카드 공개 */}
          {cardPlays.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>특수 카드 효과</h3>
              <div className={styles.specialCardsRow}>
                {cardPlays.map((play, i) => (
                  <SpecialCardItem
                    key={play.playId}
                    play={play}
                    company={room.companies[play.companyId]}
                    flipped={flippedSpecials.has(i)}
                    highlight={highlightCard === i}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 라운드 카드 */}
          {phase !== 'calculating' && phase !== 'base' && (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>라운드 이벤트</h3>
              <RoundCardItem cardType={result.roundCardType} flipped={roundCardFlipped} />
            </div>
          )}

          {/* 순위 */}
          {phase === 'done' && (
            <div className={`${styles.card} ${styles.rankCard}`}>
              <h3 className={styles.sectionTitle}>현재 순위</h3>
              <div className={styles.rankList}>
                {playersSorted.map(({ uid, rank }) => {
                  const player = room.players[uid]
                  const isMe = uid === user.uid
                  return (
                    <div key={uid} className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''}`}>
                      <span className={styles.rankNum}>
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}위`}
                      </span>
                      <span className={styles.rankName}>{player?.name ?? uid}</span>
                      {isMe && (
                        <span className={styles.rankMyAssets}>{totalAssets.toLocaleString()}원</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 버튼 / 힌트 */}
          {phase === 'done' && isHost && (
            <button className={styles.nextBtn} onClick={handleNext}>
              {isLastRound ? '최종 결과 보기 →' : `${room.currentRound + 1}라운드 시작 →`}
            </button>
          )}
          {phase === 'done' && !isHost && (
            <div className={styles.waitHint}>방장이 다음 라운드를 시작할 때까지 기다려 주세요</div>
          )}
          {phase !== 'done' && (
            <div className={styles.revealingHint}>
              {phase === 'base' && '기본 주가 변동을 확인하세요...'}
              {phase === 'special_cards' && cardIndex < cardPlays.length && '특수 카드 효과 공개 중...'}
              {phase === 'round_card' && '라운드 이벤트 공개 중...'}
            </div>
          )}
        </div>

        {/* ── 오른쪽: 내 수익표 ──────────────────────────── */}
        <div className={styles.colRight}>
          {phase === 'done' ? (
            <div className={`${styles.card} ${styles.rankCard}`}>
              <h3 className={styles.sectionTitle}>내 수익</h3>
              {myPortfolio.length > 0 ? (
                <table className={styles.portfolioTable}>
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th>보유</th>
                      <th>등락</th>
                      <th>수익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPortfolio.map(({ company, holding, rate, roundPnl }) => (
                      <tr key={company.id}>
                        <td>{company.emoji} {company.name}</td>
                        <td>{holding}주</td>
                        <td style={{ color: rate >= 0 ? '#4caf50' : '#f44336', fontWeight: 700 }}>
                          {formatRate(rate)}
                        </td>
                        <td style={{ color: roundPnl >= 0 ? '#4caf50' : '#f44336', fontWeight: 700 }}>
                          {roundPnl >= 0 ? '+' : ''}{roundPnl.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                    <tr className={styles.portfolioTotalRow}>
                      <td colSpan={3}>라운드 수익</td>
                      <td style={{ color: totalRoundPnl >= 0 ? '#4caf50' : '#f44336' }}>
                        {totalRoundPnl >= 0 ? '+' : ''}{totalRoundPnl.toLocaleString()}원
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className={styles.noHolding}>보유 종목 없음</p>
              )}
              <div className={styles.assetSummary}>
                {result.taxApplied?.[user.uid] !== undefined && (
                  <div className={styles.assetRow}>
                    <span>현금 보유세 ({((result.taxRate ?? 0) * 100).toFixed(0)}%)</span>
                    <span style={{ color: '#f44336' }}>
                      -{result.taxApplied[user.uid].toLocaleString()}원
                    </span>
                  </div>
                )}
                {(result.refillApplied?.[user.uid] ?? 0) > 0 && (
                  <div className={styles.assetRow}>
                    <span>파산 구제 리필</span>
                    <span style={{ color: '#ff9800' }}>
                      +{result.refillApplied![user.uid].toLocaleString()}원
                    </span>
                  </div>
                )}
                <div className={styles.assetRow}>
                  <span>현금 잔액</span>
                  <span>{(me?.cash ?? 0).toLocaleString()}원</span>
                </div>
                <div className={styles.assetRow}>
                  <span>주식 평가액</span>
                  <span>{portfolioValue.toLocaleString()}원</span>
                </div>
                <div className={`${styles.assetRow} ${styles.assetTotal}`}>
                  <span>총 자산</span>
                  <span>{totalAssets.toLocaleString()}원</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.card}>
              <h3 className={styles.sectionTitle}>내 수익</h3>
              <p className={styles.noHolding}>결과 공개 후 표시됩니다</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
