import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, calculateRoundResult, nextRound } from '../utils/rtdb'
import { formatRate } from '../utils/scenario'
import { CARD_LABEL, CARD_DESC, CARD_COLOR } from '../utils/cards'
import type { Room, CardPlay, RoundCardType } from '../types'
import styles from './RoundResult.module.css'

// ── 라운드 카드 메타 ──────────────────────────────────────────────────────────

const ROUND_CARD_META: Record<string, { label: string; desc: string; color: string }> = {
  market_boom:    { label: '시장 활황',   desc: '전 종목 +10%p',           color: '#4caf50' },
  market_crash:   { label: '시장 폭락',   desc: '전 종목 -10%p',           color: '#f44336' },
  big_boom:       { label: '대호재',      desc: '전 종목 +25%p',           color: '#00e676' },
  big_crash:      { label: '대폭락',      desc: '전 종목 -25%p',           color: '#ff1744' },
  volatility_up:  { label: '변동성 확대', desc: '전 종목 등락률 ×1.5',     color: '#ff9800' },
  volatility_down:{ label: '변동성 축소', desc: '전 종목 등락률 ×0.5',     color: '#78909c' },
  reversal_day:   { label: '역전의 날',   desc: '전 종목 등락 부호 반전',  color: '#ab47bc' },
  calm:           { label: '무풍지대',    desc: '전 종목 0% 확정',         color: '#607d8b' },
  polarization:   { label: '양극화',      desc: '상위 절반 +15%p / 하위 -15%p', color: '#ff7043' },
  bubble:         { label: '버블',        desc: '상승 종목 ×1.3',          color: '#ffd740' },
  panic:          { label: '공황',        desc: '전 종목 ×0.7',            color: '#e53935' },
  rate_hike:      { label: '금리 인상',   desc: '전 종목 -5%p',            color: '#546e7a' },
  liquidity:      { label: '유동성 장세', desc: '전 종목 +5%p',            color: '#26a69a' },
  news_blackout:  { label: '뉴스 블랙아웃', desc: '이번 라운드 정보 카드 무효', color: '#424242' },
}

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

function applyRoundCard(
  rates: Record<string, number>,
  roundCard: RoundCardType,
): Record<string, number> {
  const r = { ...rates }
  const ids = Object.keys(r)
  if (roundCard === 'calm') { ids.forEach(id => { r[id] = 0 }); return r }
  if (roundCard === 'news_blackout') return r
  switch (roundCard) {
    case 'market_boom':    ids.forEach(id => { r[id] += 0.10 }); break
    case 'market_crash':   ids.forEach(id => { r[id] -= 0.10 }); break
    case 'big_boom':       ids.forEach(id => { r[id] += 0.25 }); break
    case 'big_crash':      ids.forEach(id => { r[id] -= 0.25 }); break
    case 'volatility_up':  ids.forEach(id => { r[id] *= 1.5  }); break
    case 'volatility_down':ids.forEach(id => { r[id] *= 0.5  }); break
    case 'reversal_day':   ids.forEach(id => { r[id] = -r[id] }); break
    case 'polarization': {
      const sorted = [...ids].sort((a, b) => r[b] - r[a])
      const half = Math.ceil(sorted.length / 2)
      sorted.slice(0, half).forEach(id => { r[id] += 0.15 })
      sorted.slice(half).forEach(id => { r[id] -= 0.15 })
      break
    }
    case 'bubble':    ids.forEach(id => { if (r[id] > 0) r[id] *= 1.3 }); break
    case 'panic':     ids.forEach(id => { r[id] *= 0.7 }); break
    case 'rate_hike': ids.forEach(id => { r[id] -= 0.05 }); break
    case 'liquidity': ids.forEach(id => { r[id] += 0.05 }); break
  }
  return r
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

      <div className={styles.body}>
        {/* 주가 변동 패널 */}
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>주가 변동</h3>
          <div className={styles.priceList}>
            {companies.map(c => {
              const rate = displayRates[c.id] ?? 0
              const prevPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
              const displayPrice = Math.max(100, Math.round(prevPrice * (1 + rate)))
              const holding = me?.portfolio?.[c.id] ?? 0
              const finalPrice = c.priceHistory[room.currentRound] ?? prevPrice
              const pnl = phase === 'done' ? holding * (finalPrice - prevPrice) : null

              return (
                <div key={c.id} className={styles.priceRow}>
                  <span className={styles.companyEmoji}>{c.emoji}</span>
                  <span className={styles.companyName}>{c.name}</span>
                  <div className={styles.priceChange}>
                    <span className={styles.priceVal}>{displayPrice.toLocaleString()}원</span>
                    <span className={styles.rateVal}
                      style={{ color: rate >= 0 ? '#4caf50' : '#f44336' }}>
                      {formatRate(rate)}
                    </span>
                    {pnl !== null && holding > 0 && (
                      <span className={styles.pnl}
                        style={{ color: pnl >= 0 ? '#4caf50' : '#f44336' }}>
                        {pnl >= 0 ? '+' : ''}{pnl.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 특수카드 공개 영역 */}
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

        {/* 라운드 카드 공개 */}
        {phase !== 'calculating' && phase !== 'base' && (
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>라운드 이벤트</h3>
            <RoundCardItem cardType={result.roundCardType} flipped={roundCardFlipped} />
          </div>
        )}

        {/* 순위 (완료 후) */}
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
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 버튼 */}
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
    </div>
  )
}
