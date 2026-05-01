import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, ItemDef, ItemKind, ItemTier, SkillDef, TacticCardId, TournamentResult } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH, MAX_PASSIVE_SLOTS, RIVAL_STAT_PER_ROUND } from '../constants'
import { getItemById } from '../data/items'
import { TACTIC_CARDS } from '../data/tacticCards'
import { SeededRng } from '../utils/rng'
import { pickN } from '../utils/fisherYates'
import Portrait from '../components/ui/Portrait'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'
import passiveSkillsRaw from '../data/passiveSkills.json'
import '../styles/arena.css'

const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)

interface PassiveDef { id: string; name: string; description: string }
const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(
  (passiveSkillsRaw as PassiveDef[]).map(p => [p.id, p]),
)
const allPassiveIds = (passiveSkillsRaw as PassiveDef[]).map(p => p.id)

function getNpcPassives(charId: number, round: number): string[] {
  const rng = new SeededRng(charId * 997 + round)
  return pickN(allPassiveIds, Math.min(MAX_PASSIVE_SLOTS, allPassiveIds.length), rng)
}

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#aaa', rare: '#44aaff', hero: '#c05cfc', legend: '#ffd700',
}

const TIER_LABEL: Record<ItemTier, string> = {
  common: 'COMMON', rare: 'RARE', hero: 'HERO', legend: 'LEGEND',
}

const KIND_LABEL: Record<ItemKind, string> = {
  stat: '영구 스탯', combat: '전투 발동', utility: '유틸리티',
}

const STAT_ICON: Record<string, string> = {
  hp: '💗', str: '⚔️', agi: '👟', int: '🔮', luk: '🍀',
}
const COMBAT_ICON: Record<string, string> = {
  poison_dagger: '🗡️', mana_seal: '⛓️', vampire_ring: '💍', indomitable: '🛡️', golden_glove: '🧤',
}
function getItemIcon(item: ItemDef): string {
  if (item.kind === 'stat' && item.statBonus) return STAT_ICON[Object.keys(item.statBonus)[0]] ?? '📦'
  return COMBAT_ICON[item.id] ?? '📦'
}

type TooltipData =
  | { kind: 'skill';   id: string; x: number; y: number }
  | { kind: 'passive'; id: string; x: number; y: number }
  | { kind: 'item';    def: ItemDef; x: number; y: number }
  | null

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

function npcGrowth(round: number, isRival = false): GrowthStats {
  const b = NPC_BASE_GROWTH + (round - 1) + (isRival ? RIVAL_STAT_PER_ROUND * round : 0)
  return { vit: b, str: b, agi: b, int: b, luk: b }
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
  skillIds, pendingSkills, onHover,
}: {
  skillIds: string[]
  pendingSkills?: Array<{ skillId: string; turnsRemaining: number }>
  onHover: (data: TooltipData) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {skillIds.map(id => {
        const def = SKILL_BY_ID[id]
        if (!def) return null
        const color = TIER_COLOR[def.tier as ItemTier]
        return (
          <div
            key={id}
            onMouseEnter={e => {
              const r = e.currentTarget.getBoundingClientRect()
              onHover({ kind: 'skill', id, x: r.right + 6, y: r.top })
            }}
            onMouseLeave={() => onHover(null)}
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
        const color = TIER_COLOR[def.tier as ItemTier]
        return (
          <div
            key={ps.skillId}
            onMouseEnter={e => {
              const r = e.currentTarget.getBoundingClientRect()
              onHover({ kind: 'skill', id: ps.skillId, x: r.right + 6, y: r.top })
            }}
            onMouseLeave={() => onHover(null)}
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

function PassiveList({ passiveIds, onHover }: { passiveIds: string[]; onHover: (data: TooltipData) => void }) {
  if (passiveIds.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {passiveIds.map(id => {
        const p = PASSIVE_BY_ID[id]
        if (!p) return null
        return (
          <span
            key={id}
            onMouseEnter={e => {
              const r = e.currentTarget.getBoundingClientRect()
              onHover({ kind: 'passive', id, x: r.right + 6, y: r.top })
            }}
            onMouseLeave={() => onHover(null)}
            style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 999,
              background: 'rgba(161,99,255,.1)', border: '1px solid rgba(161,99,255,.3)',
              color: 'var(--violet-glow)', cursor: 'default',
            }}
          >
            {p.name}
          </span>
        )
      })}
    </div>
  )
}

function CharCard({
  char, tone, stats, growthStats, isPlayer,
  isRival, isWinnerCandidate, isDarkhorse,
  skillIds, uniqueSkillIds, pendingSkills, passives, records, onHover,
}: {
  char: CharacterDef | undefined
  tone: number
  maxHp: number
  stats: CombatStats | null
  growthStats: { vit: number; str: number; agi: number; int: number; luk: number } | null
  isPlayer?: boolean
  isRival?: boolean
  isWinnerCandidate?: boolean
  isDarkhorse?: boolean
  skillIds: string[]
  uniqueSkillIds?: string[]
  pendingSkills?: Array<{ skillId: string; turnsRemaining: number }>
  passives: string[]
  records: Array<{ label: string; value: string }>
  onHover: (data: TooltipData) => void
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

          {/* Growth stats 2-col grid */}
          {growthStats && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {([
                ['바이탈', growthStats.vit],
                ['힘',     growthStats.str],
                ['민첩',   growthStats.agi],
                ['지력',   growthStats.int],
                ['행운',   growthStats.luk],
              ] as [string, number][]).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 4, padding: '2px 5px', borderRadius: 4, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{label}</span>
                  <span className="arena-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-dim)' }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* HP/MP bars + combat stats */}
      {stats && (
        <>
          <div className="arena-divider" style={{ margin: '0 12px' }} />
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* HP bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--ink-mute)', fontWeight: 700 }}>HP</span>
                <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-dim)' }}>{stats.maxHp.toLocaleString()}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#3ecf6a,#5ef0a8)' }} />
              </div>
            </div>
            {/* MP bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--ink-mute)', fontWeight: 700 }}>MP</span>
                <span className="arena-mono" style={{ fontSize: 9, color: 'var(--ink-dim)' }}>{stats.maxMana.toLocaleString()}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#2255cc,#44aaff)' }} />
              </div>
            </div>
            {/* Combat stats row */}
            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
              {([
                ['공격', Math.round(arch === 'mage' || arch === 'support' ? stats.mAtk : stats.pAtk)],
                ['방어', Math.round(stats.pDef)],
                ['속도', Math.round(stats.spd)],
                ['크리', `${stats.crit.toFixed(0)}%`],
                ['회피', `${stats.eva.toFixed(0)}%`],
              ] as [string, string | number][]).map(([lbl, val]) => (
                <div key={lbl} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3px 4px', borderRadius: 5, background: 'rgba(255,255,255,.04)' }}>
                  <span style={{ fontSize: 8, color: 'var(--ink-mute)' }}>{lbl}</span>
                  <span className="arena-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-dim)' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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
      {(skillIds.length > 0 || (uniqueSkillIds?.length ?? 0) > 0 || (pendingSkills?.length ?? 0) > 0) && (
        <>
          <div className="arena-divider" style={{ margin: '0 12px' }} />
          <div style={{ padding: '8px 12px 8px', flex: 1 }}>
            {uniqueSkillIds ? (
              <>
                <div style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 4 }}>고유 스킬</div>
                <SkillList skillIds={uniqueSkillIds} onHover={onHover} />
                {skillIds.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '6px 0' }} />
                    <div style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 4 }}>공통 스킬</div>
                    <SkillList skillIds={skillIds} onHover={onHover} />
                  </>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 6 }}>SKILLS</div>
                <SkillList skillIds={skillIds} pendingSkills={pendingSkills} onHover={onHover} />
              </>
            )}
          </div>
        </>
      )}

      {/* Passives */}
      {passives.length > 0 && (
        <>
          <div className="arena-divider" style={{ margin: '0 12px' }} />
          <div style={{ padding: '6px 12px 10px' }}>
            <div style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 6 }}>PASSIVES</div>
            <PassiveList passiveIds={passives} onHover={onHover} />
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

  const [tooltip, setTooltip] = useState<TooltipData>(null)

  useEffect(() => { setTacticCard(null) }, [setTacticCard])

  if (!activeSlot) return null
  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo) return null

  const { matchResult: _matchResult, stageLabel, opponentId, opponentItems, opponentSkills } = matchInfo
  const pid              = activeSlot.characterId
  const isRival          = (activeSlot.rivalIds ?? []).includes(opponentId)
  const isWinnerCandidate = false
  const isDarkhorse       = false

  const playerChar    = findChar(pid)
  const opponentChar  = findChar(opponentId)

  const round         = activeSlot.currentRound
  const oppGrowth     = npcGrowth(round, (activeSlot.rivalIds ?? []).includes(opponentId))
  const playerStats   = playerChar ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const opponentStats = opponentChar ? deriveStats(opponentChar.baseCombat, oppGrowth, opponentChar.archetype) : null

  const playerMaxHp   = playerStats?.maxHp   ?? 0
  const opponentMaxHp = opponentStats?.maxHp  ?? 0

  const rawAchievement = lastTournament ? getOpponentAchievement(opponentId, lastTournament) : null
  const npcStat        = activeSlot.npcStats?.[opponentId]
  const achievement    = rawAchievement && npcStat && npcStat.bestStageCount > 1
    ? `${rawAchievement} ${npcStat.bestStageCount}회`
    : rawAchievement

  const prevMatches        = playerMatches.slice(0, playerMatchIndex)
  const currentRoundWins   = prevMatches.filter(m => m.wasPlayed && m.playerWon).length
  const currentRoundLosses = prevMatches.filter(m => m.wasPlayed && !m.playerWon).length
  const totalWins   = (activeSlot.totalWins   ?? 0) + currentRoundWins
  const totalLosses = (activeSlot.totalLosses ?? 0) + currentRoundLosses
  const h2h         = prevMatches.filter(m => m.wasPlayed && m.opponentId === opponentId)
  const h2hWins     = h2h.filter(m => m.playerWon).length
  const h2hLosses   = h2h.filter(m => !m.playerWon).length

  const playerRecords: Array<{ label: string; value: string }> = [
    { label: '통산전적', value: `${totalWins}승 ${totalLosses}패` },
    { label: '최고기록', value: (activeSlot.bestClearRound != null && activeSlot.bestClearRound !== 0) ? `R${activeSlot.bestClearRound}` : '첫 진출' },
    { label: '상대전적', value: `${h2hWins}승 ${h2hLosses}패` },
  ]

  const opponentRecords: Array<{ label: string; value: string }> = [
    { label: '통산전적', value: npcStat ? `${npcStat.totalWins}승 ${npcStat.totalLosses}패` : '0승 0패' },
    { label: '최고기록', value: achievement ?? '첫 진출' },
    { label: '상대전적', value: `${h2hLosses}승 ${h2hWins}패` },
  ]

  const playerPassives  = activeSlot.passiveSkills ?? []
  const oppPassives     = getNpcPassives(opponentId, round)
  const myItems         = (activeSlot.inventory ?? []).map(i => i.itemId)
  const showInventory   = myItems.length > 0 || opponentItems.length > 0

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* 툴팁 오버레이 */}
      {tooltip && tooltip.kind === 'skill' && (() => {
        const def = SKILL_BY_ID[tooltip.id]
        if (!def) return null
        const color = TIER_COLOR[def.tier as ItemTier]
        const left = tooltip.x + 220 > window.innerWidth ? tooltip.x - 236 : tooltip.x
        return (
          <div style={{
            position: 'fixed', left, top: tooltip.y, zIndex: 9999, width: 220,
            pointerEvents: 'none',
            background: 'rgba(12,8,24,.97)', border: `1px solid ${color}55`,
            borderRadius: 10, padding: '10px 13px',
            boxShadow: '0 4px 24px rgba(0,0,0,.65)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 6px' }}>
                {def.tier.toUpperCase()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{def.name}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginBottom: 5 }}>
              CD {def.cooldown}턴 · {def.cost} MP
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.55 }}>{def.description}</div>
          </div>
        )
      })()}
      {tooltip && tooltip.kind === 'passive' && (() => {
        const p = PASSIVE_BY_ID[tooltip.id]
        if (!p) return null
        const left = tooltip.x + 220 > window.innerWidth ? tooltip.x - 236 : tooltip.x
        return (
          <div style={{
            position: 'fixed', left, top: tooltip.y, zIndex: 9999, width: 220,
            pointerEvents: 'none',
            background: 'rgba(12,8,24,.97)', border: '1px solid rgba(161,99,255,.4)',
            borderRadius: 10, padding: '10px 13px',
            boxShadow: '0 4px 24px rgba(0,0,0,.65)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--violet-glow)', marginBottom: 5 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.55 }}>{p.description}</div>
          </div>
        )
      })()}
      {tooltip && tooltip.kind === 'item' && (() => {
        const { def, x, y } = tooltip
        const color = TIER_COLOR[def.tier]
        const icon  = getItemIcon(def)
        const left  = x + 220 > window.innerWidth ? x - 236 : x
        return (
          <div style={{
            position: 'fixed', left, top: y, zIndex: 9999, width: 210,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg,rgba(28,18,54,.98),rgba(16,10,34,.98))',
            border: `1px solid ${color}55`,
            borderRadius: 12, padding: '12px 14px',
            boxShadow: `0 8px 32px rgba(0,0,0,.6), 0 0 0 1px ${color}22`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{def.name}</div>
                <span style={{ fontSize: 9, fontWeight: 700, color, border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 6px' }}>
                  {TIER_LABEL[def.tier]}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 5 }}>{KIND_LABEL[def.kind]}</div>
            <div style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.5 }}>{def.description}</div>
          </div>
        )
      })()}
      <HeaderBar
        subtitle={`${stageLabel}`}
        round={activeSlot.currentRound}
        phase="매치 프리뷰"
        onExit={() => { if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) useGameStore.setState({ phase: 'slot_select' }) }}
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
              growthStats={activeSlot.growthStats}
              isPlayer
              uniqueSkillIds={activeSlot.initialSkills}
              skillIds={activeSlot.acquiredSkills}
              pendingSkills={activeSlot.pendingSkills}
              passives={playerPassives}
              records={playerRecords}
              onHover={setTooltip}
            />
            <div style={{ flexShrink: 0, alignSelf: 'center', fontSize: 18, fontWeight: 900, color: 'var(--violet-glow)', padding: '0 2px' }}>VS</div>
            <CharCard
              char={opponentChar}
              tone={opponentId % 6}
              maxHp={opponentMaxHp}
              stats={opponentStats}
              growthStats={oppGrowth}
              isRival={isRival}
              isWinnerCandidate={isWinnerCandidate}
              isDarkhorse={isDarkhorse}
              uniqueSkillIds={opponentChar?.skills ?? []}
              skillIds={opponentSkills}
              passives={oppPassives}
              records={opponentRecords}
              onHover={setTooltip}
            />
          </div>

          {/* Inventory */}
          {showInventory && (
            <div style={{ display: 'flex', gap: 10 }}>
              <ItemRow label="내 아이템" labelColor="var(--cyan)" itemIds={myItems} onHover={setTooltip} />
              <ItemRow label="상대 아이템" labelColor="var(--ink-mute)" itemIds={opponentItems} onHover={setTooltip} />
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
            {TACTIC_CARDS.filter(card => card.validFor.includes(playerChar?.archetype ?? '')).map(card => {
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

function ItemRow({
  label, labelColor, itemIds, onHover,
}: {
  label: string
  labelColor: string
  itemIds: string[]
  onHover: (data: TooltipData) => void
}) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'rgba(20,14,40,.7)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 10, color: labelColor, fontWeight: 700, letterSpacing: '.08em', marginBottom: 8 }}>{label}</div>
      {itemIds.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {itemIds.map((id, i) => {
            const def = getItemById(id)
            if (!def) return null
            const color = TIER_COLOR[def.tier]
            const icon  = getItemIcon(def)
            return (
              <div
                key={`${id}-${i}`}
                onMouseEnter={e => {
                  const r = e.currentTarget.getBoundingClientRect()
                  onHover({ kind: 'item', def, x: r.right + 6, y: r.top })
                }}
                onMouseLeave={() => onHover(null)}
                style={{
                  width: 44, height: 44, borderRadius: 8, cursor: 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${color}28, ${color}08)`,
                  border: `1px solid ${color}55`,
                  fontSize: 22, gap: 1,
                }}
              >
                {icon}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeaderBar({ subtitle, round, phase, onExit }: { subtitle?: string; round?: number; phase?: string; onExit?: () => void }) {
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
        {onExit && <button className="arena-btn arena-btn-ghost" onClick={onExit} style={{ fontSize: 11, padding: '4px 10px' }}>✕ 나가기</button>}
      </div>
    </div>
  )
}
