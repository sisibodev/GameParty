import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, CombatStats, GrowthStats, ItemTier, NpcStat, SkillDef, TacticCardId, TournamentResult } from '../types'
import { deriveStats } from '../engine/statDeriver'
import { NPC_BASE_GROWTH } from '../constants'
import { getItemById } from '../data/items'
import { TACTIC_CARDS } from '../data/tacticCards'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

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
    <div style={s.root}>
      <div style={s.stageLabel}>{stageLabel}</div>
      {isRival && <div style={s.rivalBanner}>🔥 라이벌전 — 승리 시 골드 ×2</div>}
      <p style={s.progress}>{playerMatchIndex + 1} / {playerMatches.length} 경기</p>

      <div style={s.vsRow}>
        <CharCard char={playerChar} maxHp={playerMaxHp} stats={playerStats} isPlayer />
        <div style={s.vsText}>VS</div>
        <CharCard
          char={opponentChar}
          maxHp={opponentMaxHp}
          stats={opponentStats}
          achievement={achievement ?? undefined}
        />
      </div>

      {/* 통산전적 / 최고기록 / 상대전적 */}
      <div style={s.recordRow}>
        <div style={s.recordCell}>
          <span style={s.recordLabel}>통산전적</span>
          <span style={s.recordVal}>{totalWins}승 {totalLosses}패</span>
        </div>
        {activeSlot.bestClearRound != null && (
          <div style={s.recordCell}>
            <span style={s.recordLabel}>최고기록</span>
            <span style={s.recordVal}>R{activeSlot.bestClearRound}</span>
          </div>
        )}
        {h2h.length > 0 && (
          <div style={s.recordCell}>
            <span style={s.recordLabel}>상대전적</span>
            <span style={s.recordH2H}>
              <span style={{ color: '#44ff88', fontWeight: 900, fontSize: '1rem' }}>{h2hWins}승</span>
              {' '}<span style={{ color: '#ff4444', fontWeight: 900, fontSize: '1rem' }}>{h2hLosses}패</span>
            </span>
          </div>
        )}
      </div>

      {opponentSkills.length > 0 && (
        <div style={s.oppItemsBox}>
          <span style={s.oppItemsLabel}>상대 스킬</span>
          <div style={s.oppSkillList}>
            {opponentSkills.map((id, i) => {
              const def = SKILL_BY_ID[id]
              if (!def) return null
              const color = TIER_COLOR[def.tier]
              return (
                <div key={`${id}-${i}`} style={{ ...s.oppSkillRow, borderColor: color }}>
                  <span style={{ ...s.oppSkillName, color }}>{def.name}</span>
                  <span style={s.oppSkillMeta}>CD {def.cooldown} · 코스트 {def.cost}</span>
                  <span style={s.oppSkillDesc}>{def.description}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {opponentItems.length > 0 && (
        <div style={s.oppItemsBox}>
          <span style={s.oppItemsLabel}>상대 아이템</span>
          <div style={s.oppItemsList}>
            {opponentItems.map((id, i) => {
              const def = getItemById(id)
              if (!def) return null
              const color = TIER_COLOR[def.tier]
              return (
                <span key={`${id}-${i}`} style={{ ...s.oppItemChip, borderColor: color, color }}>
                  {def.name}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 내 스킬 현황 */}
      {(activeSlot.initialSkills.length + activeSlot.acquiredSkills.length + (activeSlot.pendingSkills ?? []).length) > 0 && (
        <div style={s.mySkillBox}>
          <span style={s.mySkillTitle}>내 스킬</span>
          <div style={s.mySkillList}>
            {[...activeSlot.initialSkills, ...activeSlot.acquiredSkills].map(id => {
              const def = SKILL_BY_ID[id]
              if (!def) return null
              const color = TIER_COLOR[def.tier]
              return (
                <span key={id} style={{ ...s.mySkillChip, borderColor: color, color }}>
                  {def.name}
                </span>
              )
            })}
            {(activeSlot.pendingSkills ?? []).map(ps => {
              const def = SKILL_BY_ID[ps.skillId]
              if (!def) return null
              const color = TIER_COLOR[def.tier]
              return (
                <span key={ps.skillId} style={{ ...s.mySkillChip, borderColor: color, color, opacity: 0.5 }}>
                  {def.name} ({ps.turnsRemaining})
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 전술카드 선택 — 매 전투마다 */}
      <div style={s.tacticBox}>
        <div style={s.tacticTitle}>전술 카드 선택</div>
        <div style={s.tacticGrid}>
          <button
            style={{ ...s.tacticCard, ...(selectedTacticCardId === null ? s.tacticActive : {}) }}
            onClick={() => setTacticCard(null)}
          >
            <span style={s.tacticName}>미사용</span>
            <span style={s.tacticDesc}>전술 없이 진행</span>
          </button>
          {TACTIC_CARDS.map(card => {
            const active = selectedTacticCardId === card.id
            return (
              <button
                key={card.id}
                style={{ ...s.tacticCard, ...(active ? s.tacticActive : {}) }}
                onClick={() => setTacticCard(card.id as TacticCardId)}
              >
                <span style={s.tacticName}>{card.name}</span>
                <span style={s.tacticDesc}>{card.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        style={s.btnFight}
        onClick={() => startBattleForCurrentMatch(selectedTacticCardId)}
      >
        ⚔️ 전투 시작
      </button>
    </div>
  )
}

function CharCard({
  char, maxHp, stats, isPlayer, achievement, npcStat,
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
    <div style={{ ...s.charCard, border: isPlayer ? '2px solid #c0aaff' : '1px solid #444' }}>
      {isPlayer && <div style={s.playerTag}>나</div>}

      <div style={s.charIcon}>
        <span style={{ fontSize: '2rem' }}>🃏</span>
      </div>

      <div style={s.charName}>{char?.name ?? '???'}</div>
      <div style={{ ...s.archBadge, background: color + '33', color, border: `1px solid ${color}66` }}>
        {ARCHETYPE_LABEL[arch]}
      </div>
      <div style={s.hpInfo}>
        <span style={s.hpLabel}>HP</span>
        <span style={s.hpVal}>{maxHp.toLocaleString()}</span>
      </div>

      {stats && (
        <div style={s.statGrid}>
          <MiniStat label="공격" val={Math.round(stats.atk)} />
          <MiniStat label="방어" val={Math.round(stats.def)} />
          <MiniStat label="속도" val={Math.round(stats.spd)} />
          <MiniStat label="치명" val={`${stats.crit.toFixed(1)}%`} />
          <MiniStat label="회피" val={`${stats.eva.toFixed(1)}%`} />
        </div>
      )}

      {achievement && (
        <div style={s.achieveBadge}>{achievement}</div>
      )}
      {npcStat && (
        <div style={s.recordBadge}>
          통산 <span style={{ color: '#44ff88' }}>{npcStat.totalWins}승</span>
          {' '}<span style={{ color: '#ff6666' }}>{npcStat.totalLosses}패</span>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, val }: { label: string; val: string | number }) {
  return (
    <div style={s.miniStat}>
      <span style={s.miniLabel}>{label}</span>
      <span style={s.miniVal}>{val}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem 1rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '0.85rem' },
  stageLabel:   { fontSize: '1.6rem', fontWeight: 900, color: '#ffd700', letterSpacing: '0.05em' },
  progress:     { color: '#888', margin: 0, fontSize: '0.85rem' },
  vsRow:        { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginTop: '0.25rem' },
  vsText:       { fontSize: '1.5rem', fontWeight: 900, color: '#c0aaff', alignSelf: 'center', minWidth: '28px', textAlign: 'center' as const },
  // 카드 가로 확장 (148→170px) — 스탯 텍스트 줄바꿈 방지
  charCard:     { background: '#1a1a2e', borderRadius: '12px', padding: '1rem 0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', width: '170px', position: 'relative' as const },
  playerTag:    { position: 'absolute' as const, top: '6px', left: '8px', fontSize: '0.65rem', fontWeight: 700, background: '#7c5cfc', borderRadius: '4px', padding: '1px 6px', color: '#fff' },
  charIcon:     { width: '56px', height: '56px', background: '#111', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  charName:     { fontSize: '0.9rem', fontWeight: 700, textAlign: 'center' as const, color: '#e8e8ff' },
  archBadge:    { fontSize: '0.7rem', fontWeight: 700, borderRadius: '4px', padding: '2px 8px' },
  hpInfo:       { display: 'flex', gap: '0.4rem', alignItems: 'baseline' },
  hpLabel:      { fontSize: '0.7rem', color: '#666' },
  hpVal:        { fontSize: '0.9rem', fontWeight: 700, color: '#44ff88' },
  statGrid:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', width: '100%', marginTop: '2px' },
  miniStat:     { background: '#0d0d1a', borderRadius: '4px', padding: '2px 6px', display: 'flex', justifyContent: 'space-between', gap: '4px', alignItems: 'center' },
  miniLabel:    { fontSize: '0.65rem', color: '#666', whiteSpace: 'nowrap' as const },
  miniVal:      { fontSize: '0.65rem', color: '#ccc', fontWeight: 700, whiteSpace: 'nowrap' as const },
  achieveBadge: { marginTop: '4px', background: '#1a2a1a', border: '1px solid #44aa66', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', color: '#44ff88', fontWeight: 700, textAlign: 'center' as const, width: '100%' },
  // 통산전적 / 최고기록 / 상대전적 행
  recordRow:    { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, justifyContent: 'center' },
  recordCell:   { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '0.35rem 0.85rem', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '1px', minWidth: '90px' },
  recordLabel:  { fontSize: '0.65rem', color: '#666', fontWeight: 600 },
  recordVal:    { fontSize: '0.82rem', color: '#aaa', fontWeight: 700 },
  recordH2H:    { fontSize: '0.82rem', fontWeight: 700 },
  recordBadge:  { marginTop: '2px', background: '#1a1a2e', border: '1px solid #334', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', color: '#aaa', textAlign: 'center' as const, width: '100%' },
  btnFight:     { background: 'linear-gradient(135deg,#fc5c5c,#fc9c3c)', border: 'none', borderRadius: '12px', color: '#fff', padding: '1rem 3.5rem', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 700 },
  oppItemsBox:  { background: '#15152a', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '0.5rem 0.85rem', display: 'flex', flexDirection: 'column' as const, gap: '0.35rem', maxWidth: '420px', width: '100%' },
  oppItemsLabel:{ fontSize: '0.75rem', color: '#c0aaff', fontWeight: 700 },
  oppItemsList: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.3rem' },
  oppItemChip:  { fontSize: '0.72rem', border: '1px solid', borderRadius: '4px', padding: '1px 6px', background: '#1a1a2e' },
  rivalBanner:  { background: 'linear-gradient(135deg,#ff4444,#ff8844)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', borderRadius: '10px', padding: '0.35rem 1rem' },
  oppSkillList: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  oppSkillRow:  { display: 'flex', flexDirection: 'column' as const, gap: '2px', border: '1px solid', borderRadius: '6px', padding: '0.3rem 0.5rem', background: '#1a1a2e' },
  oppSkillName: { fontSize: '0.8rem', fontWeight: 700 },
  oppSkillMeta: { fontSize: '0.65rem', color: '#888' },
  oppSkillDesc: { fontSize: '0.7rem', color: '#bbb' },
  // 내 스킬 현황
  mySkillBox:   { background: '#15152a', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '0.5rem 0.85rem', width: '100%', maxWidth: '420px' },
  mySkillTitle: { fontSize: '0.72rem', color: '#c0aaff', fontWeight: 700, display: 'block', marginBottom: '0.35rem' },
  mySkillList:  { display: 'flex', flexWrap: 'wrap' as const, gap: '0.3rem' },
  mySkillChip:  { fontSize: '0.72rem', border: '1px solid', borderRadius: '4px', padding: '1px 7px', background: '#1a1a2e', whiteSpace: 'nowrap' as const },
  // 전술카드 선택 UI
  tacticBox:    { background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.75rem', width: '100%', maxWidth: '420px' },
  tacticTitle:  { fontSize: '0.78rem', color: '#c0aaff', fontWeight: 700, marginBottom: '0.5rem' },
  tacticGrid:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' },
  tacticCard:   { background: '#0d0d1a', border: '1px solid #333', borderRadius: '6px', padding: '0.45rem 0.4rem', cursor: 'pointer', color: '#e8e8ff', display: 'flex', flexDirection: 'column' as const, gap: '2px', textAlign: 'left' as const },
  tacticActive: { border: '2px solid #7c5cfc', background: '#1c1a3e', boxShadow: '0 0 0 2px #7c5cfc33' },
  tacticName:   { fontSize: '0.75rem', fontWeight: 700, color: '#c0aaff' },
  tacticDesc:   { fontSize: '0.62rem', color: '#999', lineHeight: 1.3 },
}
