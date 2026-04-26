import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, ItemTier, NpcStat, SkillDef, TacticCardId, TournamentResult } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH } from '../constants'
import { getItemById } from '../data/items'
import { TACTIC_CARDS } from '../data/tacticCards'
import Portrait from '../components/ui/Portrait'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'
import '../styles/arena.css'

const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#aaa', rare: '#44aaff', hero: '#c05cfc', legend: '#ffd700',
}

const CHARACTERS = charactersRaw as CharacterDef[]
const findChar = (id: number) => CHARACTERS.find(c => c.id === id)

const ARCHETYPE_COLOR: Record<Archetype, string> = {
  warrior: '#ff6644', mage: '#4488ff', assassin: '#aa44ff', tank: '#44dd88',
  support: '#ffcc44', ranger: '#44ffcc', berserker: '#ff4488', paladin: '#ffddaa',
}

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  warrior: '전사', mage: '마법사', assassin: '암살자', tank: '탱커',
  support: '지원', ranger: '레인저', berserker: '광전사', paladin: '팔라딘',
}

function npcGrowth(round: number): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1)
  return { hp: b, str: b, agi: b, int: b, luk: b }
}

function getOpponentAchievement(oppId: number, t: TournamentResult): string {
  if (t.winner === oppId) return '🏆 우승'
  const br = t.bracketEliminations[oppId]
  if (br !== undefined) {
    const labels: Record<number, string> = { 4: '준우승', 3: '4강', 2: '8강', 1: '16강' }
    return labels[br] ?? `${br}라운드`
  }
  if (t.finalists.includes(oppId)) return '16강'
  if (t.qualifiers.includes(oppId)) return '본선 그룹 탈락'
  return '예선 탈락'
}

function RecordValue({ value }: { value: string }) {
  // "2승 3패" 패턴이면 승(초록)·패(빨강) 색 분리, 아니면 그대로 출력
  const match = value.match(/^(\d+)승\s*(\d+)패$/)
  if (match) {
    return (
      <span className="arena-mono" style={{ fontSize: 12, fontWeight: 700 }}>
        <span style={{ color: '#5ef0a8' }}>{match[1]}승</span>
        {' '}
        <span style={{ color: '#ff5c6e' }}>{match[2]}패</span>
      </span>
    )
  }
  return (
    <span className="arena-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-glow)' }}>
      {value}
    </span>
  )
}

function SkillList({
  skillIds,
  pendingSkills,
}: {
  skillIds: string[]
  pendingSkills?: Array<{ skillId: string; turnsRemaining: number }>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {skillIds.map(id => {
        const def = SKILL_BY_ID[id]
        if (!def) return null
        const color = TIER_COLOR[def.tier]
        return (
          <div
            key={id}
            title={`CD: ${def.cooldown}  코스트: ${def.cost}MP\n${def.description}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, background: `${color}0a`, cursor: 'default' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color }}>{def.name}</span>
            <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>CD {def.cooldown} · {def.cost}MP</span>
          </div>
        )
      })}
      {pendingSkills?.map(ps => {
        const def = SKILL_BY_ID[ps.skillId]
        if (!def) return null
        const color = TIER_COLOR[def.tier]
        return (
          <div
            key={ps.skillId}
            title={`CD: ${def.cooldown}  코스트: ${def.cost}MP\n학습 중 (${ps.turnsRemaining}라운드 후)\n${def.description}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, background: `${color}06`, opacity: 0.55, cursor: 'default' }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color }}>{def.name}</span>
            <span className="arena-mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>학습 {ps.turnsRemaining}R</span>
          </div>
        )
      })}
    </div>
  )
}

function CharCard({
  char, tone, maxHp, stats, isPlayer,
  isRival, isWinnerCandidate, isDarkhorse,
  skillIds, pendingSkills, records,
}: {
  char: CharacterDef | undefined
  tone: number
  maxHp: number
  stats: CombatStats | null
  isPlayer?: boolean
  isRival?: boolean
  isWinnerCandidate?: boolean
  isDarkhorse?: boolean
  skillIds: string[]
  pendingSkills?: Array<{ skillId: string; turnsRemaining: number }>
  records: Array<{ label: string; value: string }>
}) {
  const arch  = char?.archetype ?? 'warrior'
  const color = ARCHETYPE_COLOR[arch] ?? '#888'

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: isPlayer ? 'rgba(124,80,240,.1)' : 'rgba(20,14,40,.7)',
      border: `1px solid ${isPlayer ? 'rgba(164,120,255,.5)' : 'var(--line)'}`,
      borderRadius: 14, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top: portrait + info */}
      <div style={{ display: 'flex', gap: 10, padding: '12px 12px 10px' }}>
        {/* Portrait */}
        <div style={{ flexShrink: 0, width: 90 }}>
          <Portrait height={120} tone={tone} label={ARCHETYPE_LABEL[arch] ?? arch} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
            {char?.name ?? '???'}
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {isPlayer && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(164,120,255,.2)', border: '1px solid rgba(164,120,255,.5)', color: 'var(--violet-glow)' }}>나</span>
            )}
            {isRival && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,92,110,.2)', border: '1px solid rgba(255,92,110,.5)', color: '#ff5c6e' }}>라이벌</span>
            )}
            {isWinnerCandidate && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,214,107,.15)', border: '1px solid rgba(255,214,107,.5)', color: 'var(--gold)' }}>우승후보</span>
            )}
            {isDarkhorse && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(103,232,249,.15)', border: '1px solid rgba(103,232,249,.5)', color: 'var(--cyan)' }}>다크호스</span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: `${color}22`, border: `1px solid ${color}55`, color }}>
              {ARCHETYPE_LABEL[arch]}
            </span>
          </div>

          {/* Stats 2-col grid */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {([
                ['HP',   maxHp.toLocaleString()],
                ['ATK',  Math.round(stats.atk)],
                ['DEF',  Math.round(stats.def)],
                ['SPD',  Math.round(stats.spd)],
                ['CRT%', `${stats.crit.toFixed(1)}%`],
                ['EVA%', `${stats.eva.toFixed(1)}%`],
              ] as [string, string | number][]).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{label}</span>
                  <span className="arena-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-dim)' }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Records */}
      {records.length > 0 && (
        <>
          <div className="arena-divider" style={{ margin: '0 12px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'rgba(0,0,0,.18)' }}>
            {records.map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ink-dim)', fontWeight: 600 }}>{label}</span>
                <RecordValue value={value} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Skills */}
      {(skillIds.length > 0 || (pendingSkills?.length ?? 0) > 0) && (
        <>
          <div className="arena-divider" style={{ margin: '0 12px' }} />
          <div style={{ padding: '8px 12px 12px', flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 6 }}>SKILLS</div>
            <SkillList skillIds={skillIds} pendingSkills={pendingSkills} />
          </div>
        </>
      )}
    </div>
  )
}

export default function MatchPreviewPage() {
  const {
    playerMatches, playerMatchIndex, activeSlot, lastTournament,
    selectedTacticCardId, setTacticCard, startBattleForCurrentMatch,
  } = useGameStore()

  useEffect(() => { setTacticCard(null) }, [setTacticCard])

  if (!activeSlot) return null
  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo) return null

  const { matchResult, stageLabel, opponentId, opponentItems, opponentSkills } = matchInfo
  const pid              = activeSlot.characterId
  const isRival          = (activeSlot.rivalIds ?? []).includes(opponentId)
  const isWinnerCandidate = lastTournament?.winner === opponentId
  const isDarkhorse      = (lastTournament?.darkhorses ?? []).includes(opponentId)

  const playerChar    = findChar(pid)
  const opponentChar  = findChar(opponentId)
  const playerMaxHp   = matchResult.initialHp[pid]        ?? 0
  const opponentMaxHp = matchResult.initialHp[opponentId] ?? 0

  const round         = activeSlot.currentRound
  const oppGrowth     = npcGrowth(round)
  const playerStats   = playerChar ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const opponentStats = opponentChar ? deriveStats(opponentChar.baseCombat, oppGrowth, opponentChar.archetype) : null

  const rawAchievement = lastTournament ? getOpponentAchievement(opponentId, lastTournament) : null
  const npcStat        = activeSlot.npcStats?.[opponentId]
  const achievement    = rawAchievement && npcStat && npcStat.bestStageCount > 1
    ? `${rawAchievement} ${npcStat.bestStageCount}회`
    : rawAchievement

  const prevMatches = playerMatches.slice(0, playerMatchIndex)
  const totalWins   = prevMatches.filter(m => m.playerWon).length
  const totalLosses = prevMatches.filter(m => !m.playerWon).length
  const h2h         = prevMatches.filter(m => m.opponentId === opponentId)
  const h2hWins     = h2h.filter(m => m.playerWon).length
  const h2hLosses   = h2h.filter(m => !m.playerWon).length

  const playerRecords: Array<{ label: string; value: string }> = [
    { label: '통산전적', value: `${totalWins}승 ${totalLosses}패` },
    { label: '최고기록', value: activeSlot.bestClearRound != null ? `R${activeSlot.bestClearRound}` : '첫 진출' },
    { label: '상대전적', value: `${h2hWins}승 ${h2hLosses}패` },
  ]

  const opponentRecords: Array<{ label: string; value: string }> = [
    { label: '통산전적', value: npcStat ? `${npcStat.totalWins}승 ${npcStat.totalLosses}패` : '0승 0패' },
    { label: '최고기록', value: achievement ?? '첫 진출' },
    { label: '상대전적', value: `${h2hLosses}승 ${h2hWins}패` },
  ]

  const playerSkillIds = [...activeSlot.initialSkills, ...activeSlot.acquiredSkills]
  const myItems        = (activeSlot.inventory ?? []).map(i => i.itemId)
  const showInventory  = myItems.length > 0 || opponentItems.length > 0

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <HeaderBar
        subtitle={`${stageLabel} · ${playerMatchIndex + 1}/${playerMatches.length} 경기`}
        round={activeSlot.currentRound}
        phase="매치 프리뷰"
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel — flex:6 */}
        <div style={{ flex: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {isRival && (
            <div style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,rgba(255,92,110,.15),rgba(255,136,68,.1))', border: '1px solid rgba(255,92,110,.4)', color: '#ff8c6e', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
              🔥 라이벌전 — 승리 시 골드 ×2
            </div>
          )}

          {/* Character cards */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <CharCard
              char={playerChar}
              tone={pid % 6}
              maxHp={playerMaxHp}
              stats={playerStats}
              isPlayer
              skillIds={playerSkillIds}
              pendingSkills={activeSlot.pendingSkills}
              records={playerRecords}
            />
            <div style={{ flexShrink: 0, alignSelf: 'center', fontSize: 18, fontWeight: 900, color: 'var(--violet-glow)', padding: '0 2px' }}>VS</div>
            <CharCard
              char={opponentChar}
              tone={opponentId % 6}
              maxHp={opponentMaxHp}
              stats={opponentStats}
              isRival={isRival}
              isWinnerCandidate={isWinnerCandidate}
              isDarkhorse={isDarkhorse}
              skillIds={opponentSkills}
              records={opponentRecords}
            />
          </div>

          {/* Inventory */}
          {showInventory && (
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(20,14,40,.7)', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 700, letterSpacing: '.08em', marginBottom: 6 }}>내 아이템</div>
                {myItems.length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>—</div>
                  : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {myItems.map((id, i) => {
                        const def = getItemById(id)
                        if (!def) return null
                        const c = TIER_COLOR[def.tier]
                        return (
                          <span key={`${id}-${i}`} title={def.description} style={{ fontSize: 11, color: c, border: `1px solid ${c}44`, borderRadius: 6, padding: '3px 8px', background: `${c}0d`, cursor: 'default' }}>
                            {def.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
              </div>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(20,14,40,.7)', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10, color: 'var(--ink-mute)', fontWeight: 700, letterSpacing: '.08em', marginBottom: 6 }}>상대 아이템</div>
                {opponentItems.length === 0
                  ? <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>—</div>
                  : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {opponentItems.map((id, i) => {
                        const def = getItemById(id)
                        if (!def) return null
                        const c = TIER_COLOR[def.tier]
                        return (
                          <span key={`${id}-${i}`} title={def.description} style={{ fontSize: 11, color: c, border: `1px solid ${c}44`, borderRadius: 6, padding: '3px 8px', background: `${c}0d`, cursor: 'default' }}>
                            {def.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — flex:4 */}
        <div style={{ flex: 4, minWidth: 260, borderLeft: '1px solid var(--line)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(10,6,20,.5)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-glow)' }}>전술 카드 1장 선택</div>
            <button
              style={{ fontSize: 11, color: 'var(--ink-mute)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit' }}
              onClick={() => setTacticCard(null)}
            >
              OR 사용 안 함
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
            {TACTIC_CARDS.map(card => {
              const active = selectedTacticCardId === card.id
              return (
                <button
                  key={card.id}
                  className={`arena-tactic${active ? ' arena-tactic-active' : ''}`}
                  onClick={() => setTacticCard(card.id as TacticCardId)}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-glow)', marginBottom: 4 }}>{card.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-mute)', lineHeight: 1.3 }}>{card.description}</div>
                </button>
              )
            })}
          </div>

          <button
            className="arena-btn arena-btn-gold"
            style={{ width: '100%', justifyContent: 'center', borderRadius: 12, padding: '13px 0', fontSize: 15 }}
            onClick={() => startBattleForCurrentMatch(selectedTacticCardId)}
          >
            ⚔️ 전투 시작
          </button>
        </div>
      </div>
    </div>
  )
}

function HeaderBar({ subtitle, round, phase }: { subtitle?: string; round?: number; phase?: string }) {
  const { activeSlot } = useGameStore()
  const gold = activeSlot?.gold ?? null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--line)', background: 'linear-gradient(180deg,rgba(20,14,36,.85),rgba(15,10,26,.6))' }}>
      <div>
        <div className="arena-kr" style={{ fontSize: 16 }}>배틀 그랑프리</div>
        {subtitle && <div className="arena-mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {phase && <div className="arena-mono" style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', fontSize: 11, color: 'var(--ink-dim)' }}>{phase}</div>}
        {round != null && <div className="arena-mono" style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(124,80,240,.15)', border: '1px solid rgba(124,80,240,.4)', fontSize: 11, fontWeight: 700, color: 'var(--violet-glow)' }}>ROUND {round}</div>}
        {gold != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,214,107,.1)', border: '1px solid rgba(255,214,107,.4)' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#fff3b0,#c98a1a)' }} />
            <span className="arena-mono" style={{ fontWeight: 700, color: 'var(--gold)', fontSize: 12 }}>{gold.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
