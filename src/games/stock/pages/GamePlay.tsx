import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { subscribeRoom, unsubscribeRoom, recordTrade, playSpecialCard, applyHandSwap, endRound, setRoundReady, useInfoCard, usePremiumCard, dissolveRoom, pickDraft, useRoundCardChoice } from '../utils/rtdb'
import { formatKRW, formatRate, getTaxRate } from '../utils/scenario'
import { CARD_LABEL, CARD_COLOR, CARD_DESC, ROUND_CARD_META, ROUND_CARD_POOL } from '../utils/cards'
import type { RoundCardType } from '../types'
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
  const [pendingCard, setPendingCard] = useState<Card | null>(null)        // 특수 카드 대상 선택
  const [pendingInfoCard, setPendingInfoCard] = useState<Card | null>(null) // 정보 카드 대상 선택
  const [infoTargetType, setInfoTargetType] = useState<'company' | 'player'>('company')
  const [infoResult, setInfoResult] = useState<{ title: string; body: string; color?: string } | null>(null)
  const [pendingRoundCardChoice, setPendingRoundCardChoice] = useState<Card | null>(null) // 라운드 카드 선택권
  // 플레이어 대상 특수 카드: 1단계(플레이어 선택) → 2단계(회사 선택, focused_snipe/trade_freeze만)
  const [pendingPlayerCard, setPendingPlayerCard] = useState<Card | null>(null)
  const [pendingPlayerCardWithTarget, setPendingPlayerCardWithTarget] = useState<{ card: Card; targetUid: string } | null>(null)
  // 스캔 정보 패널: 라운드 내내 유지되는 실시간 정보 항목
  const [scanPanel, setScanPanel] = useState<Array<{ cardId: string; type: string; targetId: string; title: string }>>([])
  const [draftTimeLeft, setDraftTimeLeft] = useState(0)  // 드래프트 선택 남은 시간
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const roomRef = useRef<ReturnType<typeof subscribeRoom> | null>(null)
  const endingRef = useRef(false)  // 중복 endRound 방지

  // ── 드래프트 순서 계산 (hooks 실행 전 null-safe로 미리 계산) ──────────────────
  const _draftPickIndex = room?.draftPickIndex ?? 0
  const _draftOrderArr: string[] = room?.draftOrder
    ? (Array.isArray(room.draftOrder) ? room.draftOrder : Object.values(room.draftOrder))
    : []
  const _currentPickerUid = _draftOrderArr[_draftPickIndex]
  const _isMyDraftTurn = !!(user && _currentPickerUid === user.uid)
  const _isDraftDone = _draftPickIndex >= _draftOrderArr.length
  const _myDraftChosen = user ? (room?.players[user.uid]?.draftChosen ?? null) : null

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

      // 전원 레디 → 방장이 라운드 종료
      const playerUids = Object.keys(r.players)
      const roundReady = r.roundReady ?? {}
      const allReady = playerUids.length > 0 && playerUids.every(uid => roundReady[uid])
      if (allReady && !endingRef.current) {
        endingRef.current = true
        endRound(roomId)
      }
    })
    return () => { if (roomRef.current) unsubscribeRoom(roomRef.current) }
  }, [roomId, navigate])

  // 라운드 변경 시 레디 상태 리셋
  useEffect(() => {
    endingRef.current = false
  }, [room?.currentRound])

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

  // 라운드 변경 시 스캔 패널 초기화
  useEffect(() => { setScanPanel([]) }, [room?.currentRound])

  // 드래프트 내 차례 → 20초 카운트다운 시작/중지
  useEffect(() => {
    if (!_isMyDraftTurn || _myDraftChosen || _isDraftDone) {
      if (draftTimerRef.current) { clearInterval(draftTimerRef.current); draftTimerRef.current = null }
      setDraftTimeLeft(0)
      return
    }
    setDraftTimeLeft(20)
    draftTimerRef.current = setInterval(() => setDraftTimeLeft(t => Math.max(0, t - 1)), 1000)
    return () => { if (draftTimerRef.current) { clearInterval(draftTimerRef.current); draftTimerRef.current = null } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_isMyDraftTurn, !!_myDraftChosen, _isDraftDone, _draftPickIndex])

  // 드래프트 타이머 0 → 랜덤 자동 선택
  useEffect(() => {
    if (draftTimeLeft > 0 || !_isMyDraftTurn || _myDraftChosen || _isDraftDone || !room || !user || !roomId) return
    const pool: Card[] = Array.isArray(room.draftPool) ? room.draftPool : Object.values(room.draftPool ?? {})
    const pickedIds = Object.values(room.draftPickers ?? {}) as string[]
    const unpicked = pool.filter(c => !pickedIds.includes(c.id))
    if (unpicked.length > 0) {
      pickDraft(roomId, user.uid, unpicked[Math.floor(Math.random() * unpicked.length)].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTimeLeft])

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

  const PLAYER_TARGETED_CARDS = ['cash_burn','portfolio_snipe','profit_steal','focused_snipe','forced_invest','trade_freeze','hand_swap']

  const handleUseSpecialCard = useCallback(async (card: Card) => {
    if (!room || !user || !roomId) return
    const me = room.players[user.uid]
    if (me.usedSpecialThisRound >= me.maxSpecialThisRound) return

    if (PLAYER_TARGETED_CARDS.includes(card.type)) {
      setPendingPlayerCard(card)   // 플레이어 선택 모달 열기
    } else {
      setPendingCard(card)         // 회사 선택 모달 열기 (기존)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 플레이어 대상 특수 카드: 플레이어 선택 완료
  const confirmPlayerTarget = useCallback(async (targetUid: string) => {
    const card = pendingPlayerCard!
    setPendingPlayerCard(null)
    if (!room || !user || !roomId) return

    // 2단계(회사 선택)가 필요한 카드
    if (card.type === 'focused_snipe' || card.type === 'trade_freeze') {
      setPendingPlayerCardWithTarget({ card, targetUid })
      return
    }
    // 즉시 실행 카드
    if (card.type === 'hand_swap') {
      await applyHandSwap(roomId, user.uid, card.id, targetUid)
    } else {
      await playSpecialCard(roomId, room.currentRound, user.uid, '', card.id, card.type, targetUid)
    }
  }, [pendingPlayerCard, room, user, roomId])

  // 플레이어 대상 특수 카드: 회사 선택 완료 (focused_snipe / trade_freeze)
  const confirmPlayerCardCompany = useCallback(async (companyId: string) => {
    const { card, targetUid } = pendingPlayerCardWithTarget!
    setPendingPlayerCardWithTarget(null)
    if (!room || !user || !roomId) return
    await playSpecialCard(roomId, room.currentRound, user.uid, companyId, card.id, card.type, targetUid)
  }, [pendingPlayerCardWithTarget, room, user, roomId])

  const handleUseInfoCard = useCallback(async (card: Card) => {
    if (!room || !user || !roomId) return
    const me = room.players[user.uid]
    if (me.usedInfoThisRound >= me.maxInfoThisRound) return

    const round = room.currentRound

    switch (card.type) {
      // ── 스캔 패널 (회사 선택 후 패널에 추가) ──
      case 'trend':
      case 'detect':
      case 'rate_insight':
      case 'card_appraise':
        setPendingInfoCard(card)
        setInfoTargetType('company')
        return

      // ── 스캔 패널 (플레이어 선택 후 패널에 추가) ──
      case 'shadow':
        setPendingInfoCard(card)
        setInfoTargetType('player')
        return

      // ── 스캔 패널 (즉시, 대상 없음) ──
      case 'market_scan': {
        await useInfoCard(roomId, user.uid, card.id)
        setScanPanel(prev => {
          if (prev.some(e => e.type === 'market_scan')) return prev
          return [...prev, { cardId: card.id, type: 'market_scan', targetId: '', title: '시장 스캔' }]
        })
        break
      }

      // ── 모달 (일회성 정보) ──
      case 'portfolio_scan':
        setPendingInfoCard(card)
        setInfoTargetType('player')
        return

      case 'round_forecast': {
        const roundCard = room.roundCard?.[round]
        if (!roundCard) return
        const meta = ROUND_CARD_META[roundCard]
        await useInfoCard(roomId, user.uid, card.id)
        setInfoResult({ title: '이번 라운드 이벤트', body: meta ? `${meta.label}\n${meta.desc}` : roundCard, color: meta?.color })
        break
      }
      case 'whistleblower': {
        const plays = Object.values(room.cardPlays?.[round] ?? {})
        const cnt: Record<string, number> = {}
        for (const p of plays) cnt[p.companyId] = (cnt[p.companyId] ?? 0) + 1
        const topId = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]
        const topC = topId ? room.companies[topId] : null
        await useInfoCard(roomId, user.uid, card.id)
        setInfoResult({
          title: '내부고발',
          body: topC ? `${topC.emoji} ${topC.name}\n특수 카드 ${cnt[topId]}장 집중` : '아직 사용된 특수 카드 없음',
          color: '#ff9800',
        })
        break
      }
      case 'premium': {
        await usePremiumCard(roomId, user.uid, card.id)
        setInfoResult({ title: '특급 카드', body: '이번 라운드\n특수 카드 +1장\n정보 카드 +1장', color: '#ff9800' })
        break
      }
      // ── 라운드 카드 선택권 — 선택 모달 열기 ──
      case 'round_card_choice':
        setPendingRoundCardChoice(card)
        return
    }
  }, [room, user, roomId])

  const confirmInfoCardTarget = useCallback(async (targetId: string) => {
    if (!pendingInfoCard || !room || !user || !roomId) return

    switch (pendingInfoCard.type) {
      // ── 스캔 패널에 추가 (실시간 유지) ──
      case 'trend': {
        const c = room.companies[targetId]
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setScanPanel(prev => [...prev, { cardId: pendingInfoCard.id, type: 'trend', targetId, title: `등락 예보 — ${c?.emoji} ${c?.name}` }])
        break
      }
      case 'detect': {
        const c = room.companies[targetId]
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setScanPanel(prev => [...prev, { cardId: pendingInfoCard.id, type: 'detect', targetId, title: `카드 탐지 — ${c?.emoji} ${c?.name}` }])
        break
      }
      case 'rate_insight': {
        const c = room.companies[targetId]
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setScanPanel(prev => [...prev, { cardId: pendingInfoCard.id, type: 'rate_insight', targetId, title: `수익률 투시 — ${c?.emoji} ${c?.name}` }])
        break
      }
      case 'card_appraise': {
        const c = room.companies[targetId]
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setScanPanel(prev => [...prev, { cardId: pendingInfoCard.id, type: 'card_appraise', targetId, title: `카드 감정 — ${c?.emoji} ${c?.name}` }])
        break
      }
      case 'shadow': {
        const player = room.players[targetId]
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setScanPanel(prev => [...prev, { cardId: pendingInfoCard.id, type: 'shadow', targetId, title: `미행 — ${player?.name ?? targetId}` }])
        break
      }
      // ── 모달 (일회성) ──
      case 'portfolio_scan': {
        const player = room.players[targetId]
        const port = player?.portfolio ?? {}
        const held = Object.entries(port).filter(([, qty]) => (qty as number) > 0)
        const body = held.length > 0
          ? held.map(([cid]) => { const c = room.companies[cid]; return c ? `${c.emoji} ${c.name}` : cid }).join('\n')
          : '보유 종목 없음'
        await useInfoCard(roomId, user.uid, pendingInfoCard.id)
        setInfoResult({ title: `포트폴리오 스캔 — ${player?.name ?? targetId}`, body, color: '#2196f3' })
        break
      }
    }
    setPendingInfoCard(null)
  }, [pendingInfoCard, room, user, roomId])

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

  // 레디 상태
  const roundReady = room.roundReady ?? {}
  const isReady = roundReady[user.uid] ?? false
  const readyCount = Object.values(roundReady).filter(Boolean).length
  const totalCount = Object.keys(room.players).length

  // 공유 드래프트 (2라운드부터) — 상단에서 미리 계산한 값 재사용
  const draftPool: Card[] =
    Array.isArray(room.draftPool) ? room.draftPool : Object.values(room.draftPool ?? {})
  const draftPickers = room.draftPickers ?? {}
  const currentPickerUid = _currentPickerUid
  const isMyDraftTurn = _isMyDraftTurn
  const isDraftDone = _isDraftDone
  const myDraftChosen = me?.draftChosen

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
        <span className={styles.taxLabel}>
          보유세 {(getTaxRate(room.currentRound) * 100).toFixed(0)}%
        </span>
        <span className={styles.cashLabel}>{formatKRW(me?.cash ?? 0)}</span>
        {user.uid === room.host && (
          <button
            className={styles.dissolveBtn}
            onClick={async () => {
              if (window.confirm('방을 해산하면 모든 플레이어가 로비로 돌아갑니다. 해산하시겠습니까?')) {
                await dissolveRoom(roomId!)
              }
            }}
          >
            방 해산
          </button>
        )}
      </div>

      <div className={styles.main}>
        {/* 종목 패널 */}
        <div className={styles.companiesPanel}>
          {companies.map(c => {
            const curPrice = c.priceHistory[room.currentRound - 1] ?? c.priceHistory[0]
            const prevPrice = c.priceHistory[room.currentRound - 2] ?? c.priceHistory[0]
            const change = prevPrice > 0 ? (curPrice - prevPrice) / prevPrice : 0
            const holding = me?.portfolio?.[c.id] ?? 0
            const isFrozen = me?.activeEffects?.tradeFreezeCompanyId === c.id
            return (
              <div
                key={c.id}
                className={`${styles.companyRow} ${selectedCompany === c.id ? styles.companyRowSelected : ''} ${isFrozen ? styles.companyRowFrozen : ''}`}
                onClick={() => setSelectedCompany(c.id)}
              >
                <span className={styles.companyEmoji}>{c.emoji}</span>
                <div className={styles.companyInfo}>
                  <span className={styles.companyName}>{c.name}</span>
                  {holding > 0 && <span className={styles.holdingBadge}>{holding}주</span>}
                  {isFrozen && <span className={styles.frozenBadge}>거래정지</span>}
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
                <div className={styles.pctBtnRow}>
                  <span className={styles.pctLabel}>매수</span>
                  {[25, 50, 75].map(pct => (
                    <button
                      key={`buy${pct}`}
                      className={styles.pctBtn}
                      onClick={() => setTradeQty(Math.max(1, Math.floor((me?.cash ?? 0) * pct / 100 / selPrice)))}
                      disabled={selPrice === 0 || (me?.cash ?? 0) < selPrice}
                    >{pct}%</button>
                  ))}
                  <span className={styles.pctLabel}>매도</span>
                  {[25, 50, 75].map(pct => (
                    <button
                      key={`sell${pct}`}
                      className={styles.pctBtn}
                      onClick={() => setTradeQty(Math.max(1, Math.round(myHolding * pct / 100)))}
                      disabled={myHolding === 0}
                    >{pct}%</button>
                  ))}
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
                <div className={styles.handCardGrid}>
                  {mySpecialCards.map(card => {
                    const disabled = me.usedSpecialThisRound >= me.maxSpecialThisRound
                    const color = CARD_COLOR[card.type] ?? '#666'
                    return (
                      <div
                        key={card.id}
                        className={`${styles.handCard} ${disabled ? styles.handCardDisabled : ''}`}
                        style={{ borderColor: color }}
                        onClick={() => !disabled && handleUseSpecialCard(card)}
                      >
                        <div className={styles.handCardName} style={{ color }}>{CARD_LABEL[card.type]}</div>
                        <div className={styles.handCardDesc}>{CARD_DESC[card.type]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 정보 카드 */}
            {myInfoCards.length > 0 && (
              <div className={styles.cardGroup}>
                <span className={styles.cardGroupLabel}>
                  정보 카드 ({me.usedInfoThisRound}/{me.maxInfoThisRound})
                </span>
                <div className={styles.handCardGrid}>
                  {myInfoCards.map(card => {
                    const disabled = me.usedInfoThisRound >= me.maxInfoThisRound
                    const color = CARD_COLOR[card.type] ?? '#2196f3'
                    return (
                      <div
                        key={card.id}
                        className={`${styles.handCard} ${disabled ? styles.handCardDisabled : ''}`}
                        style={{ borderColor: color }}
                        onClick={() => !disabled && handleUseInfoCard(card)}
                      >
                        <div className={styles.handCardName} style={{ color }}>{CARD_LABEL[card.type]}</div>
                        <div className={styles.handCardDesc}>{CARD_DESC[card.type]}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 공유 드래프트 (2라운드부터) */}
            {room.currentRound >= 2 && (draftPool as Card[]).length > 0 && (
              <div className={styles.draftArea}>
                <span className={styles.cardGroupLabel}>
                  드래프트 —{' '}
                  {isDraftDone
                    ? '선택 완료'
                    : isMyDraftTurn
                    ? <span style={{ color: draftTimeLeft <= 5 ? '#f44336' : '#ffc107' }}>
                        내 차례! {draftTimeLeft}초 남음
                      </span>
                    : `${room.players[currentPickerUid]?.name ?? ''} 선택 중...`}
                </span>
                <div className={styles.handCardGrid}>
                  {(draftPool as Card[]).map(card => {
                    const pickerUid = Object.entries(draftPickers).find(([, cid]) => cid === card.id)?.[0]
                    const isPicked = pickerUid !== undefined
                    const isMyPick = pickerUid === user.uid
                    const canPick = isMyDraftTurn && !isPicked && !isDraftDone && !myDraftChosen
                    const color = CARD_COLOR[card.type] ?? (card.category === 'info' ? '#2196f3' : '#666')
                    return (
                      <div
                        key={card.id}
                        className={`${styles.handCard} ${styles.handCardDraft} ${!canPick ? styles.handCardDisabled : ''}`}
                        style={{
                          borderColor: isPicked ? (isMyPick ? color : 'rgba(255,255,255,0.15)') : color,
                          opacity: isPicked && !isMyPick ? 0.45 : 1,
                        }}
                        onClick={() => canPick && pickDraft(roomId!, user.uid, card.id)}
                      >
                        <div className={styles.handCardName}
                          style={{ color: isPicked && !isMyPick ? 'rgba(255,255,255,0.4)' : color }}>
                          {CARD_LABEL[card.type]}
                        </div>
                        <div className={styles.handCardDesc}>
                          {isPicked
                            ? (isMyPick ? '✓ 내가 선택' : `${room.players[pickerUid!]?.name ?? ''} 선택`)
                            : CARD_DESC[card.type]}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {/* 사용 카드 현황 패널 */}
            {(() => {
              const myPlays = Object.values(room.cardPlays?.[room.currentRound] ?? {})
                .filter(p => p.userId === user.uid)
              if (myPlays.length === 0) return null
              return (
                <div className={styles.usedCardsPanel}>
                  <span className={styles.usedCardsPanelLabel}>이번 라운드 사용</span>
                  <div className={styles.usedCardTags}>
                    {myPlays.map(p => {
                      const c = room.companies[p.companyId]
                      const targetP = p.targetUserId ? room.players[p.targetUserId] : null
                      return (
                        <span key={p.playId} className={styles.usedCardTag}>
                          {CARD_LABEL[p.cardType]}
                          {targetP ? ` → ${targetP.name}` : c ? ` → ${c.emoji}${c.name}` : ''}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* 📡 스캔 정보 패널 (실시간) */}
            {scanPanel.length > 0 && (
              <div className={styles.scanPanel}>
                <div className={styles.scanPanelHeader}>
                  <span>📡 스캔 정보 (실시간)</span>
                  <button className={styles.scanPanelClose} onClick={() => setScanPanel([])}>✕</button>
                </div>
                {scanPanel.map(entry => {
                  const round = room.currentRound
                  let body = ''
                  let color = '#2196f3'

                  if (entry.type === 'trend') {
                    const c = room.companies[entry.targetId]
                    if (c) {
                      const prev = c.priceHistory[round - 1] ?? c.priceHistory[0]
                      const next = c.priceHistory[round] ?? prev
                      const up = next >= prev
                      body = up ? '▲ 상승' : '▼ 하락'
                      color = up ? '#4caf50' : '#f44336'
                    }
                  } else if (entry.type === 'rate_insight') {
                    const c = room.companies[entry.targetId]
                    if (c) {
                      const prev = c.priceHistory[round - 1] ?? c.priceHistory[0]
                      const next = c.priceHistory[round] ?? prev
                      const rate = prev > 0 ? (next - prev) / prev : 0
                      body = `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`
                      color = rate >= 0 ? '#4caf50' : '#f44336'
                    }
                  } else if (entry.type === 'detect') {
                    const count = Object.values(room.cardPlays?.[round] ?? {})
                      .filter(p => p.companyId === entry.targetId && !['portfolio_snipe','profit_steal','cash_burn','forced_invest','trade_freeze','hand_swap'].includes(p.cardType)).length
                    body = count > 0 ? `특수 카드 ${count}장` : '카드 없음'
                  } else if (entry.type === 'card_appraise') {
                    const COMPANY_SPECIAL_TYPES = ['small_surge','small_drop','surge','drop','boom','crash','reversal','card_nullifier']
                    const plays = Object.values(room.cardPlays?.[round] ?? {})
                      .filter(p => p.companyId === entry.targetId && COMPANY_SPECIAL_TYPES.includes(p.cardType))
                    if (plays.length > 0) {
                      const cardCounts: Record<string, number> = {}
                      for (const p of plays) cardCounts[p.cardType] = (cardCounts[p.cardType] ?? 0) + 1
                      body = Object.entries(cardCounts).map(([t, n]) => `${CARD_LABEL[t] ?? t}${n > 1 ? `×${n}` : ''}`).join(', ')
                    } else {
                      body = '카드 없음'
                    }
                  } else if (entry.type === 'market_scan') {
                    const comps = Object.values(room.companies)
                    const sorted = [...comps].sort((a, b) => {
                      const rA = (a.priceHistory[round - 1] ?? 0) > 0
                        ? ((a.priceHistory[round] ?? 0) - (a.priceHistory[round - 1] ?? 0)) / (a.priceHistory[round - 1] ?? 1) : 0
                      const rB = (b.priceHistory[round - 1] ?? 0) > 0
                        ? ((b.priceHistory[round] ?? 0) - (b.priceHistory[round - 1] ?? 0)) / (b.priceHistory[round - 1] ?? 1) : 0
                      return rB - rA
                    })
                    const top = sorted.slice(0, 2).map(c => `${c.emoji}${c.name}`).join(', ')
                    const bot = sorted.slice(-2).map(c => `${c.emoji}${c.name}`).join(', ')
                    body = `▲ ${top}  /  ▼ ${bot}`
                  } else if (entry.type === 'shadow') {
                    const tradesRaw = room.trades?.[round]?.[entry.targetId] ?? {}
                    const cids = Object.keys(tradesRaw)
                    body = cids.length > 0
                      ? cids.map(cid => { const c = room.companies[cid]; return c ? `${c.emoji}${c.name}` : cid }).join(', ')
                      : '아직 거래 없음'
                  }

                  return (
                    <div key={entry.cardId} className={styles.scanEntry}>
                      <span className={styles.scanEntryTitle}>{entry.title}</span>
                      <span className={styles.scanEntryBody} style={{ color }}>{body}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 순위표 오버레이 (Tab 홀드) */}
      {showRank && (
        <div className={styles.rankOverlay}>
          {/* 현재 순위 */}
          <div className={styles.rankOverlaySection}>
            <div className={styles.rankOverlayTitle}>📊 현재 순위</div>
            {playersSorted.map((p, i) => (
              <div key={p.uid} className={`${styles.rankRow} ${p.uid === user.uid ? styles.rankRowMe : ''}`}>
                <span className={styles.rankNum}>{i + 1}위</span>
                <span className={styles.rankName}>{p.name}</span>
              </div>
            ))}
          </div>

          {/* 회사별 미니 차트 */}
          <div className={styles.rankOverlaySection}>
            <div className={styles.rankOverlayTitle}>📈 가격 추이</div>
            <div className={styles.miniChartGrid}>
              {companies.map(c => {
                const history = c.priceHistory.slice(0, room.currentRound)
                const min = Math.min(...history)
                const max = Math.max(...history)
                const range = max - min || 1
                const w = 80, h = 30
                const pts = history.map((p, i) => {
                  const x = (i / Math.max(history.length - 1, 1)) * w
                  const y = h - ((p - min) / range) * h
                  return `${x},${y}`
                }).join(' ')
                const lastChange = history.length >= 2
                  ? (history[history.length - 1] - history[history.length - 2]) / history[history.length - 2]
                  : 0
                const lineColor = lastChange >= 0 ? '#4caf50' : '#f44336'
                return (
                  <div key={c.id} className={styles.miniChartItem}>
                    <div className={styles.miniChartLabel}>{c.emoji} {c.name}</div>
                    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <span className={styles.miniChartRate} style={{ color: lineColor }}>
                      {lastChange >= 0 ? '+' : ''}{(lastChange * 100).toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 세율 구간 */}
          <div className={styles.rankOverlaySection}>
            <div className={styles.rankOverlayTitle}>💰 현금 보유세</div>
            <div className={styles.taxScheduleRow}>
              {Array.from({ length: room.settings.rounds }, (_, i) => {
                const r = i + 1
                const rate = getTaxRate(r) * 100
                const isCurrent = r === room.currentRound
                return (
                  <span key={r} className={`${styles.taxBadge} ${isCurrent ? styles.taxBadgeCurrent : ''}`}>
                    {r}R {rate}%
                  </span>
                )
              })}
            </div>
          </div>

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

      {/* 레디 버튼 */}
      <div className={styles.readyBar}>
        <button
          className={`${styles.readyBtn} ${isReady ? styles.readyBtnOn : ''}`}
          onClick={() => setRoundReady(roomId!, user.uid, !isReady)}
        >
          {isReady ? '✓ 준비 완료' : '레디'}
        </button>
        <span className={styles.readyCount}>{readyCount} / {totalCount} 준비</span>
      </div>

      {/* 정보 카드 대상 선택 모달 */}
      {pendingInfoCard && (
        <div className={styles.modalOverlay} onClick={() => setPendingInfoCard(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: CARD_COLOR[pendingInfoCard.type] ?? '#2196f3' }}>
              {CARD_LABEL[pendingInfoCard.type]}
            </h3>
            <p className={styles.modalDesc}>{CARD_DESC[pendingInfoCard.type]}</p>
            {infoTargetType === 'company' ? (
              <div className={styles.modalCompanies}>
                {companies.map(c => (
                  <button key={c.id} className={styles.modalCompanyBtn} onClick={() => confirmInfoCardTarget(c.id)}>
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.modalCompanies}>
                {Object.values(room.players).filter(p => p.uid !== user.uid).map(p => (
                  <button key={p.uid} className={styles.modalCompanyBtn} onClick={() => confirmInfoCardTarget(p.uid)}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <button className={styles.modalCancel} onClick={() => setPendingInfoCard(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 집중 투자 강제 알림 배너 */}
      {me?.activeEffects?.forcedInvest && (
        <div className={styles.forcedInvestBanner}>
          ⚠️ 집중 투자 강제 적용 중 — 현금의 75% 이상을 한 종목에 투자해야 합니다. 미이행 시 라운드 결산 때 자동 집행됩니다.
        </div>
      )}

      {/* 플레이어 대상 특수 카드: 플레이어 선택 모달 */}
      {pendingPlayerCard && (
        <div className={styles.modalOverlay} onClick={() => setPendingPlayerCard(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: CARD_COLOR[pendingPlayerCard.type] ?? '#e91e63' }}>
              {CARD_LABEL[pendingPlayerCard.type]} — 대상 플레이어 선택
            </h3>
            <p className={styles.modalDesc}>{CARD_DESC[pendingPlayerCard.type]}</p>
            <div className={styles.modalCompanies}>
              {Object.values(room.players).filter(p => p.uid !== user.uid).map(p => (
                <button key={p.uid} className={styles.modalCompanyBtn} onClick={() => confirmPlayerTarget(p.uid)}>
                  {p.name}
                  {p.rank > 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8em', marginLeft: '0.4rem' }}>{p.rank}위</span>}
                </button>
              ))}
            </div>
            <button className={styles.modalCancel} onClick={() => setPendingPlayerCard(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 플레이어 대상 특수 카드: 회사 선택 모달 (focused_snipe / trade_freeze) */}
      {pendingPlayerCardWithTarget && (
        <div className={styles.modalOverlay} onClick={() => setPendingPlayerCardWithTarget(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: CARD_COLOR[pendingPlayerCardWithTarget.card.type] ?? '#e91e63' }}>
              {CARD_LABEL[pendingPlayerCardWithTarget.card.type]} — 종목 선택
            </h3>
            <p className={styles.modalDesc}>
              대상: {room.players[pendingPlayerCardWithTarget.targetUid]?.name}
            </p>
            <div className={styles.modalCompanies}>
              {companies.map(c => (
                <button key={c.id} className={styles.modalCompanyBtn} onClick={() => confirmPlayerCardCompany(c.id)}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
            <button className={styles.modalCancel} onClick={() => setPendingPlayerCardWithTarget(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 라운드 카드 선택권 모달 */}
      {pendingRoundCardChoice && (
        <div className={styles.modalOverlay} onClick={() => setPendingRoundCardChoice(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#e91e63' }}>라운드 카드 선택권</h3>
            <p className={styles.modalDesc}>다음 라운드 이벤트 카드를 직접 선택하세요.</p>
            <div className={styles.modalCompanies}>
              {(ROUND_CARD_POOL as RoundCardType[]).map(type => {
                const meta = ROUND_CARD_META[type]
                return (
                  <button
                    key={type}
                    className={styles.modalCompanyBtn}
                    style={{ borderColor: meta?.color ?? '#aaa', color: meta?.color ?? 'inherit' }}
                    onClick={async () => {
                      if (!roomId || !user) return
                      await useRoundCardChoice(roomId, user.uid, pendingRoundCardChoice.id, type)
                      setInfoResult({ title: '라운드 카드 선택', body: `${meta?.label ?? type}\n${meta?.desc ?? ''}`, color: meta?.color })
                      setPendingRoundCardChoice(null)
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{meta?.label ?? type}</span>
                    <span style={{ fontSize: '0.8em', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>{meta?.desc}</span>
                  </button>
                )
              })}
            </div>
            <button className={styles.modalCancel} onClick={() => setPendingRoundCardChoice(null)}>취소</button>
          </div>
        </div>
      )}

      {/* 정보 카드 결과 모달 */}
      {infoResult && (
        <div className={styles.modalOverlay} onClick={() => setInfoResult(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: infoResult.color ?? 'var(--color-text)' }}>{infoResult.title}</h3>
            {infoResult.body.split('\n').map((line, i) => (
              <p key={i} className={i === 0 ? styles.infoResultName : styles.infoResultDesc}>{line}</p>
            ))}
            <button className={styles.modalCancel} onClick={() => setInfoResult(null)}>확인</button>
          </div>
        </div>
      )}

      {/* 방장 강제 종료 버튼 */}
      {user.uid === room.host && (
        <button className={styles.endBtn} onClick={() => { endingRef.current = true; endRound(roomId!) }}>
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
