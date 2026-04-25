import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, ItemTier, NpcStat, SkillDef, TacticCardId, TournamentResult } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH } from '../constants'
import { getItemById } from '../data/items'
import { TACTIC_CARDS } from '../data/tacticCards'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'
import '../styles/arena.css'

const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(
  (skillsRaw as SkillDef[]).map(s => [s.id, s]),
)

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#aaa',
  rare:   '#44aaff',
  hero:   '#c05cfc',
  legend: '#ffd700',
}

const CHARACTERS = charactersRaw as CharacterDef[]
const findChar = (id: number) => CHARACTERS.find(c => c.id === id)

const ARCHETYPE_COLOR: Record<Archetype, string> = {
  warrior:   '#ff6644',
  mage:      '#4488ff',
  assassin:  '#aa44ff',
  tank:      '#44dd88',
  support:   '#ffcc44',
  ranger:    '#44ffcc',
  berserker: '#ff4488',
  paladin:   '#ffddaa',
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

export default function MatchPreviewPage() {
  const {
    playerMatches, playerMatchIndex, activeSlot, lastTournament,
    selectedTacticCardId, setTacticCard, startBattleForCurrentMatch,
  } = useGameStore()

  // 매 전투마다 전술카드 초기화
  useEffect(() => { setTacticCard(null) }, [setTacticCard])

  if (!activeSlot) return null

  const matchInfo = playerMatches[playerMatchIndex]
  if (!matchInfo) return null

  const { matchResult, stageLabel, opponentId, opponentItems, opponentSkills } = matchInfo
  const pid     = activeSlot.characterId
  const isRival = (activeSlot.rivalIds ?? []).includes(opponentId)

  const playerChar    = findChar(pid)
  const opponentChar  = findChar(opponentId)
  const playerMaxHp   = matchResult.initialHp[pid]        ?? 0
  const opponentMaxHp = matchResult.initialHp[opponentId] ?? 0

  const round        = activeSlot.currentRound
  const oppGrowth    = npcGrowth(round)
  const playerStats: CombatStats | null  = playerChar
    ? deriveStats(playerChar.baseCombat, activeSlot.growthStats, playerChar.archetype) : null
  const opponentStats: CombatStats | null = opponentChar
    ? deriveStats(opponentChar.baseCombat, oppGrowth, opponentChar.archetype) : null

  const rawAchievement = lastTournament ? getOpponentAchievement(opponentId, lastTournament) : null
  const npcStat = activeSlot.npcStats?.[opponentId]
  const achievement = rawAchievement && npcStat && npcStat.bestStageCount > 1
    ? `${rawAchievement} ${npcStat.bestStageCount}회`
    : rawAchievement

  const prevMatches  = playerMatches.slice(0, playerMatchIndex)
  const totalWins    = prevMatches.filter(m => m.playerWon).length
  const totalLosses  = prevMatches.filter(m => !m.playerWon).length
  const h2h          = prevMatches.filter(m => m.opponentId === opponentId)
  const h2hWins      = h2h.filter(m => m.playerWon).length
  const h2hLosses    = h2h.filter(m => !m.playerWon).length

  return (
    <div className="arena-bg-arena" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle={`${stageLabel} · ${playerMatchIndex + 1}/${playerMatches.length} 경기`}
        round={activeSlot.currentRound}
        phase="매치 프리뷰"
      />

      <div style={{ flex:1, display:'flex', gap:0, overflow:'hidden' }}>
        {/* Left: VS layout */}
        <div style={{ flex:1, padding:'20px 16px', display:'flex', flexDirection:'column' as const, gap:16, overflowY:'auto' as const }}>
          {isRival && (
            <div style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,rgba(255,92,110,.15),rgba(255,136,68,.1))', border:'1px solid rgba(255,92,110,.4)', color:'#ff8c6e', fontWeight:700, fontSize:13, textAlign:'center' as const }}>
              🔥 라이벌전 — 승리 시 골드 ×2
            </div>
          )}

          <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
            <CharCard char={playerChar} maxHp={playerMaxHp} stats={playerStats} isPlayer />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 40px', alignSelf:'center', fontSize:18, fontWeight:900, color:'var(--violet-glow)' }}>VS</div>
            <CharCard char={opponentChar} maxHp={opponentMaxHp} stats={opponentStats} achievement={achievement ?? undefined} />
          </div>

          {/* Records */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
            {[['통산전적', `${totalWins}승 ${totalLosses}패`], ...(activeSlot.bestClearRound != null ? [['최고기록', `R${activeSlot.bestClearRound}`]] : []), ...(h2h.length > 0 ? [['상대전적', `${h2hWins}승 ${h2hLosses}패`]] : [])] .map(([label, val]) => (
              <div key={label} style={{ padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,.03)', border:'1px solid var(--line)', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:2 }}>
                <div style={{ fontSize:10, color:'var(--ink-mute)' }}>{label}</div>
                <div className="arena-mono" style={{ fontSize:13, fontWeight:700, color:'var(--ink)' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Opponent skills */}
          {opponentSkills.length > 0 && (
            <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(20,14,40,.7)', border:'1px solid var(--line)' }}>
              <div style={{ fontSize:11, color:'var(--violet-glow)', fontWeight:700, marginBottom:8 }}>상대 스킬</div>
              <div style={{ display:'flex', flexDirection:'column' as const, gap:6 }}>
                {opponentSkills.map((id, i) => {
                  const def = SKILL_BY_ID[id]
                  if (!def) return null
                  const color = TIER_COLOR[def.tier]
                  return (
                    <div key={`${id}-${i}`} style={{ display:'flex', flexDirection:'column' as const, gap:2, border:`1px solid ${color}44`, borderRadius:8, padding:'6px 10px', background:`${color}08` }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, fontWeight:700, color }}>{def.name}</span>
                        <span className="arena-mono" style={{ fontSize:10, color:'var(--ink-mute)' }}>CD {def.cooldown} · 코스트 {def.cost}</span>
                      </div>
                      <span style={{ fontSize:11, color:'var(--ink-dim)' }}>{def.description}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Opponent items */}
          {opponentItems.length > 0 && (
            <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(20,14,40,.7)', border:'1px solid var(--line)' }}>
              <div style={{ fontSize:11, color:'var(--violet-glow)', fontWeight:700, marginBottom:8 }}>상대 아이템</div>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6 }}>
                {opponentItems.map((id, i) => {
                  const def = getItemById(id)
                  if (!def) return null
                  const color = TIER_COLOR[def.tier]
                  return (
                    <span key={`${id}-${i}`} style={{ fontSize:11, color, border:`1px solid ${color}44`, borderRadius:6, padding:'3px 8px', background:`${color}0d` }}>
                      {def.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* My skills */}
          {(activeSlot.initialSkills.length + activeSlot.acquiredSkills.length + (activeSlot.pendingSkills ?? []).length) > 0 && (
            <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(20,14,40,.7)', border:'1px solid var(--line)' }}>
              <div style={{ fontSize:11, color:'var(--cyan)', fontWeight:700, marginBottom:8 }}>내 스킬</div>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6 }}>
                {[...activeSlot.initialSkills, ...activeSlot.acquiredSkills].map(id => {
                  const def = SKILL_BY_ID[id]
                  if (!def) return null
                  const color = TIER_COLOR[def.tier]
                  return <span key={id} style={{ fontSize:11, color, border:`1px solid ${color}44`, borderRadius:6, padding:'3px 8px', background:`${color}0d` }}>{def.name}</span>
                })}
                {(activeSlot.pendingSkills ?? []).map(ps => {
                  const def = SKILL_BY_ID[ps.skillId]
                  if (!def) return null
                  const color = TIER_COLOR[def.tier]
                  return <span key={ps.skillId} style={{ fontSize:11, color, border:`1px solid ${color}44`, borderRadius:6, padding:'3px 8px', background:`${color}0d`, opacity:0.5 }}>{def.name} ({ps.turnsRemaining})</span>
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: tactic card selection */}
        <div style={{ width:260, borderLeft:'1px solid var(--line)', padding:16, display:'flex', flexDirection:'column' as const, gap:12, background:'rgba(10,6,20,.5)', overflowY:'auto' as const }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--violet-glow)' }}>전술 카드 선택</div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button
              className={`arena-tactic${selectedTacticCardId === null ? ' arena-tactic-active' : ''}`}
              onClick={() => setTacticCard(null)}
            >
              <div style={{ fontSize:12, fontWeight:700, color:'var(--ink-dim)', marginBottom:4 }}>미사용</div>
              <div style={{ fontSize:10, color:'var(--ink-mute)', lineHeight:1.3 }}>전술 없이 진행</div>
            </button>
            {TACTIC_CARDS.map(card => {
              const active = selectedTacticCardId === card.id
              return (
                <button
                  key={card.id}
                  className={`arena-tactic${active ? ' arena-tactic-active' : ''}`}
                  onClick={() => setTacticCard(card.id as TacticCardId)}
                >
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--violet-glow)', marginBottom:4 }}>{card.name}</div>
                  <div style={{ fontSize:10, color:'var(--ink-mute)', lineHeight:1.3 }}>{card.description}</div>
                </button>
              )
            })}
          </div>

          <div style={{ marginTop:'auto' }}>
            <button
              className="arena-btn arena-btn-gold"
              style={{ width:'100%', justifyContent:'center', borderRadius:12, padding:'13px 0', fontSize:15 }}
              onClick={() => startBattleForCurrentMatch(selectedTacticCardId)}
            >
              ⚔️ 전투 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CharCard({
  char, maxHp, stats, isPlayer, achievement,
}: {
  char: CharacterDef | undefined
  maxHp: number
  stats: CombatStats | null
  isPlayer?: boolean
  achievement?: string
}) {
  const arch  = char?.archetype ?? 'warrior'
  const color = ARCHETYPE_COLOR[arch] ?? '#888'

  return (
    <div style={{ flex:1, background: isPlayer ? 'rgba(124,80,240,.1)' : 'rgba(20,14,40,.7)', border:`1px solid ${isPlayer ? 'rgba(164,120,255,.5)' : 'var(--line)'}`, borderRadius:14, padding:'14px 12px', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:8, position:'relative' as const, minWidth:140 }}>
      {isPlayer && <div style={{ position:'absolute' as const, top:8, left:10, fontSize:10, fontWeight:700, background:'var(--violet-2)', borderRadius:4, padding:'1px 7px', color:'#fff' }}>나</div>}

      <div style={{ width:56, height:56, background:`${color}22`, border:`1px solid ${color}44`, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>🃏</div>

      <div style={{ fontSize:14, fontWeight:700, textAlign:'center' as const, color:'var(--ink)' }}>{char?.name ?? '???'}</div>
      <div style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:`${color}22`, border:`1px solid ${color}55`, color }}>
        {ARCHETYPE_LABEL[arch]}
      </div>
      <div style={{ display:'flex', gap:6, alignItems:'baseline' }}>
        <span style={{ fontSize:10, color:'var(--ink-mute)' }}>HP</span>
        <span className="arena-mono" style={{ fontSize:14, fontWeight:700, color:'var(--green)' }}>{maxHp.toLocaleString()}</span>
      </div>

      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, width:'100%' }}>
          {([['공격', Math.round(stats.atk)], ['방어', Math.round(stats.def)], ['속도', Math.round(stats.spd)], ['치명', `${stats.crit.toFixed(1)}%`], ['회피', `${stats.eva.toFixed(1)}%`]] as [string, string|number][]).map(([label, val]) => (
            <div key={label} style={{ background:'rgba(255,255,255,.03)', borderRadius:6, padding:'3px 7px', display:'flex', justifyContent:'space-between', gap:4 }}>
              <span style={{ fontSize:10, color:'var(--ink-mute)', whiteSpace:'nowrap' as const }}>{label}</span>
              <span className="arena-mono" style={{ fontSize:10, color:'var(--ink-dim)', fontWeight:700, whiteSpace:'nowrap' as const }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {achievement && (
        <div style={{ width:'100%', background:'rgba(94,240,168,.08)', border:'1px solid rgba(94,240,168,.3)', borderRadius:6, padding:'4px 8px', fontSize:11, color:'var(--green)', fontWeight:700, textAlign:'center' as const }}>
          {achievement}
        </div>
      )}
    </div>
  )
}

function HeaderBar({ subtitle, round, phase }: { subtitle?: string; round?: number; phase?: string }) {
  const { activeSlot } = useGameStore()
  const gold = activeSlot?.gold ?? null
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid var(--line)', background:'linear-gradient(180deg,rgba(20,14,36,.85),rgba(15,10,26,.6))' }}>
      <div>
        <div className="arena-kr" style={{ fontSize:16 }}>배틀 그랑프리</div>
        {subtitle && <div className="arena-mono" style={{ fontSize:11, color:'var(--ink-mute)', marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {phase && <div className="arena-mono" style={{ padding:'5px 10px', borderRadius:999, background:'rgba(255,255,255,.04)', border:'1px solid var(--line)', fontSize:11, color:'var(--ink-dim)' }}>{phase}</div>}
        {round != null && <div className="arena-mono" style={{ padding:'6px 12px', borderRadius:999, background:'rgba(124,80,240,.15)', border:'1px solid rgba(124,80,240,.4)', fontSize:11, fontWeight:700, color:'var(--violet-glow)' }}>ROUND {round}</div>}
        {gold != null && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:999, background:'rgba(255,214,107,.1)', border:'1px solid rgba(255,214,107,.4)' }}>
            <div style={{ width:12, height:12, borderRadius:'50%', background:'radial-gradient(circle at 30% 30%,#fff3b0,#c98a1a)' }}/>
            <span className="arena-mono" style={{ fontWeight:700, color:'var(--gold)', fontSize:12 }}>{gold.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
