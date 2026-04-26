import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { Archetype, CharacterDef, RunRecord, SaveSlot, SkillDef, SkillTier } from '../types'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'
import HeaderBar    from '../components/ui/HeaderBar'
import '../styles/arena.css'

const characters  = charactersRaw as CharacterDef[]
const SKILLS_MAP  = Object.fromEntries((skillsRaw as SkillDef[]).map(s => [s.id, s]))
const charName    = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`

type TabKey  = 'encyclopedia' | 'records'
type SortKey = 'score' | 'name' | 'archetype'

const ARCHETYPE_LABELS: Record<Archetype, string> = {
  tank: '탱커', berserker: '버서커', assassin: '어쌔신', ranger: '레인저',
  mage: '마법사', paladin: '팔라딘', warrior: '전사', support: '서포터',
}

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  tank: '#67e8f9', berserker: '#ff5c6e', assassin: '#a478ff', ranger: '#5ef0a8',
  mage: '#ff7ab6', paladin: '#ffd66b', warrior: '#ff9a44', support: '#67e8f9',
}

const SKILL_TIER_COLOR: Record<SkillTier, string> = {
  common: '#9aa3b2', rare: '#67e8f9', hero: '#c78bff', legend: '#ffd66b',
}

const ALL_ARCHETYPES = Object.keys(ARCHETYPE_LABELS) as Archetype[]

function buildBestScores(slots: SaveSlot[]): Record<number, number> {
  const map: Record<number, number> = {}
  for (const slot of slots) {
    for (const rec of slot.runRecords ?? []) {
      if (map[rec.characterId] === undefined || rec.score > map[rec.characterId]) {
        map[rec.characterId] = rec.score
      }
    }
  }
  return map
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function sortChars(
  chars: CharacterDef[],
  sort: SortKey,
  unlocked: number[],
  bestScores: Record<number, number>,
): CharacterDef[] {
  return [...chars].sort((a, b) => {
    const aLocked = !unlocked.includes(a.id)
    const bLocked = !unlocked.includes(b.id)
    if (aLocked !== bLocked) return aLocked ? 1 : -1
    if (sort === 'score') {
      return (bestScores[b.id] ?? -1) - (bestScores[a.id] ?? -1)
    }
    if (sort === 'name') return a.name.localeCompare(b.name, 'ko')
    if (sort === 'archetype') {
      const diff = ALL_ARCHETYPES.indexOf(a.archetype) - ALL_ARCHETYPES.indexOf(b.archetype)
      if (diff !== 0) return diff
      return (bestScores[b.id] ?? -1) - (bestScores[a.id] ?? -1)
    }
    return 0
  })
}

// ─── CharCard ─────────────────────────────────────────────────────────────────

function CharCard({ char, isNew, isLocked, isWinner, bestScore }: {
  char: CharacterDef
  isNew: boolean
  isLocked: boolean
  isWinner: boolean
  bestScore?: number
}) {
  const color = ARCHETYPE_COLORS[char.archetype]

  if (isLocked) {
    return (
      <div style={{
        aspectRatio: '1', borderRadius: 14, overflow: 'hidden', position: 'relative',
        background: 'rgba(10,6,20,.8)', border: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔒</div>
        <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,.4)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mute)' }}>???</div>
          <div style={{
            display: 'inline-block', fontSize: 9, fontWeight: 700, borderRadius: 999,
            padding: '1px 6px', marginTop: 2,
            border: `1px solid ${color}44`, color: `${color}88`, background: `${color}0d`,
          }}>
            {ARCHETYPE_LABELS[char.archetype]}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        aspectRatio: '1', borderRadius: 14, overflow: 'hidden', position: 'relative',
        border: `1px solid ${color}33`, display: 'flex', flexDirection: 'column',
        transition: 'transform .1s, box-shadow .1s', cursor: 'default',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = `0 6px 20px ${color}33`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
    >
      <div style={{
        flex: 1, position: 'relative',
        background: `linear-gradient(135deg, rgba(15,10,28,.9), rgba(22,14,40,.9))`,
        backgroundImage: `repeating-linear-gradient(135deg, ${color}1a 0px 8px, transparent 8px 16px)`,
      }}>
        {bestScore !== undefined && (
          <div style={{
            position: 'absolute', top: 6, left: 6, fontSize: 11, fontWeight: 800,
            color: '#fff', background: `${color}cc`, borderRadius: 6, padding: '2px 6px', lineHeight: 1.2,
          }}>
            {bestScore.toLocaleString()}
          </div>
        )}
        <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 9, color: 'var(--ink-mute)', fontFamily: 'monospace' }}>
          #{String(char.id).padStart(3, '0')}
        </div>
        {isWinner && <div style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 14 }}>🏆</div>}
        {isNew   && (
          <div style={{
            position: 'absolute', bottom: 6, left: 6, fontSize: 8, fontWeight: 700,
            background: 'var(--red)', color: '#fff', padding: '1px 5px', borderRadius: 3,
          }}>NEW</div>
        )}
      </div>
      <div style={{ padding: '6px 8px', background: 'rgba(10,6,20,.85)' }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {char.name}
        </div>
        <div style={{
          display: 'inline-block', fontSize: 9, fontWeight: 700, borderRadius: 999,
          padding: '1px 6px', border: `1px solid ${color}55`, color, background: `${color}12`,
        }}>
          {ARCHETYPE_LABELS[char.archetype]}
        </div>
      </div>
    </div>
  )
}

// ─── RecordRow ────────────────────────────────────────────────────────────────

function RecordRow({ rec, rank, expanded, onToggle }: {
  rec: RunRecord; rank: number; expanded: boolean; onToggle: () => void
}) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 6 }}>
      <button
        style={{
          width: '100%', background: 'transparent', border: 'none', color: 'var(--ink)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', textAlign: 'left',
        }}
        onClick={onToggle}
      >
        <span style={{ fontSize: 10, color: 'var(--ink-mute)', minWidth: 20 }}>#{rank}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--gold)', minWidth: 52 }}>
          {rec.score.toLocaleString()}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet-glow)', flex: 1 }}>
          {charName(rec.characterId)} · R{rec.endRound}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{rec.wins}승 {rec.losses}패</span>
        {rec.items.length > 0 && <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>📦{rec.items.length}</span>}
        <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{formatDate(rec.finishedAt)}</span>
        <span style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{
          padding: '8px 10px', borderTop: '1px solid var(--line)',
          background: 'rgba(10,6,20,.5)', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-dim)', flexWrap: 'wrap' }}>
            <span>HP+{rec.growthStats.hp}</span>
            <span>STR+{rec.growthStats.str}</span>
            <span>AGI+{rec.growthStats.agi}</span>
            <span>INT+{rec.growthStats.int}</span>
            <span>LUK+{rec.growthStats.luk}</span>
          </div>
          {rec.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {rec.skills.map((id, i) => {
                const def   = SKILLS_MAP[id] as SkillDef | undefined
                const color = def ? SKILL_TIER_COLOR[def.tier] : '#666'
                return (
                  <span key={`${id}-${i}`} style={{
                    fontSize: 10, border: `1px solid ${color}`, borderRadius: 4,
                    padding: '1px 5px', color, background: `${color}12`,
                  }}>
                    {def?.name ?? id}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Right Panel ─────────────────────────────────────────────────────────────

function RecordsPanel({ activeSlot }: { activeSlot: SaveSlot | null }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const records = activeSlot?.runRecords ?? []
  const best    = records[0]

  return (
    <div style={{
      flex: 3, borderLeft: '1px solid var(--line)', padding: 20,
      display: 'flex', flexDirection: 'column', gap: 14,
      background: 'rgba(10,6,20,.6)', overflowY: 'auto',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--violet-glow)', marginBottom: 2 }}>🏆 내 플레이 기록</div>
        {activeSlot && (
          <div style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
            SLOT {activeSlot.slotId} · 상위 20건 · 점수 내림차순
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 24, lineHeight: 1.7 }}>
          아직 기록이 없습니다.<br />토너먼트를 완료하면<br />기록이 쌓입니다.
        </div>
      ) : (
        <>
          {best && (
            <div style={{
              borderRadius: 12, padding: '14px 16px',
              background: 'linear-gradient(135deg, rgba(255,214,107,.12), rgba(255,214,107,.04))',
              border: '1px solid rgba(255,214,107,.35)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold)', letterSpacing: '.08em', marginBottom: 4 }}>
                BEST RUN · 🏅
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>
                {best.score.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 6 }}>
                {charName(best.characterId)} · R{best.endRound} · {best.wins}승 {best.losses}패
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {records.slice(0, 20).map((rec, i) => (
              <RecordRow
                key={i} rec={rec} rank={i + 1}
                expanded={expanded === i}
                onToggle={() => setExpanded(expanded === i ? null : i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function EncyclopediaPage() {
  const { unlockedCharIds, newCharIds, clearNewChars, slots, activeSlot } = useGameStore()
  const winnerCharIds = slots.filter(s => s.bestClearRound != null).map(s => s.characterId)
  const bestScores    = buildBestScores(slots)

  const [tab,         setTab]         = useState<TabKey>('encyclopedia')
  const [sort,        setSort]        = useState<SortKey>('score')
  const [filter,      setFilter]      = useState<Archetype | 'all'>('all')
  const [expandedRec, setExpandedRec] = useState<number | null>(null)

  useEffect(() => { clearNewChars() }, [clearNewChars])

  const unlockedCount = characters.filter(c => unlockedCharIds.includes(c.id)).length
  const recordedCount = Object.keys(bestScores).length
  const allRecords    = activeSlot?.runRecords ?? []

  const filteredChars = filter === 'all' ? characters : characters.filter(c => c.archetype === filter)
  const sortedChars   = sortChars(filteredChars, sort, unlockedCharIds, bestScores)

  return (
    <div className="arena-bg" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <HeaderBar
        subtitle="ENCYCLOPEDIA & RECORDS"
        onExit={() => useGameStore.setState({ phase: 'slot_select' })}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 20px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.4)' }}>
        {(['encyclopedia', '도감'], ['records', '내 기록'] as const) && (
          [['encyclopedia', '도감'], ['records', '내 기록']] as [TabKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className="arena-btn"
            style={{
              fontSize: 13, padding: '6px 18px', borderRadius: 999,
              background: tab === key ? 'var(--violet)' : 'transparent',
              color: tab === key ? '#fff' : 'var(--ink-dim)',
              border: `1px solid ${tab === key ? 'var(--violet)' : 'var(--line)'}`,
              fontWeight: tab === key ? 700 : 400,
            }}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left 7 ── */}
        <div style={{ flex: 7, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {tab === 'encyclopedia' ? (
            <>
              <div style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>📖 캐릭터 도감</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 3 }}>
                    해금 {unlockedCount} / {characters.length} · 최고점 기록 {recordedCount}건
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(['score', 'name', 'archetype'] as SortKey[]).map(s => (
                    <button
                      key={s}
                      className="arena-btn"
                      style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 999,
                        background: sort === s ? 'rgba(164,120,255,.2)' : 'transparent',
                        color: sort === s ? 'var(--violet-glow)' : 'var(--ink-mute)',
                        border: `1px solid ${sort === s ? 'var(--violet)' : 'var(--line)'}`,
                        fontWeight: sort === s ? 700 : 400,
                      }}
                      onClick={() => setSort(s)}
                    >
                      {s === 'score' ? '점수순' : s === 'name' ? '이름순' : '직군순'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 20px 12px' }}>
                <button
                  className="arena-btn"
                  style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 999,
                    background: filter === 'all' ? 'rgba(164,120,255,.2)' : 'transparent',
                    color: filter === 'all' ? 'var(--violet-glow)' : 'var(--ink-mute)',
                    border: `1px solid ${filter === 'all' ? 'var(--violet)' : 'var(--line)'}`,
                  }}
                  onClick={() => setFilter('all')}
                >
                  전체
                </button>
                {ALL_ARCHETYPES.map(a => {
                  const c = ARCHETYPE_COLORS[a]
                  const active = filter === a
                  return (
                    <button key={a} className="arena-btn"
                      style={{
                        fontSize: 11, padding: '3px 10px', borderRadius: 999,
                        background: active ? `${c}22` : 'transparent',
                        color: active ? c : 'var(--ink-mute)',
                        border: `1px solid ${active ? c : 'var(--line)'}`,
                        fontWeight: active ? 700 : 400,
                      }}
                      onClick={() => setFilter(a)}
                    >
                      {ARCHETYPE_LABELS[a]}
                    </button>
                  )
                })}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                  {sortedChars.map(c => (
                    <CharCard
                      key={c.id} char={c}
                      isNew={newCharIds.includes(c.id)}
                      isLocked={!unlockedCharIds.includes(c.id)}
                      isWinner={winnerCharIds.includes(c.id)}
                      bestScore={bestScores[c.id]}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>내 기록</div>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 16 }}>{allRecords.length}건</div>
              {allRecords.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 40 }}>
                  아직 기록이 없습니다.<br />토너먼트를 완료하면 기록이 쌓입니다.
                </div>
              ) : (
                allRecords.map((rec, i) => (
                  <RecordRow
                    key={i} rec={rec} rank={i + 1}
                    expanded={expandedRec === i}
                    onToggle={() => setExpandedRec(expandedRec === i ? null : i)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Right 3 ── */}
        <RecordsPanel activeSlot={activeSlot} />
      </div>
    </div>
  )
}
