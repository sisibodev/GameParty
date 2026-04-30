import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, RunRecord, SkillDef, SkillTier } from '../types'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'

const CHARACTERS   = charactersRaw as CharacterDef[]
const SKILLS_BY_ID = Object.fromEntries((skillsRaw as SkillDef[]).map(s => [s.id, s]))
const charName     = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

const TIER_COLOR: Record<SkillTier, string> = {
  common: '#aaa', rare: '#44aaff', hero: '#c05cfc', legend: '#ffd700',
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function RecordDetail({ rec }: { rec: RunRecord }) {
  return (
    <div style={dt.detail}>
      <div style={dt.row}>
        <span style={dt.label}>라운드</span><span style={dt.val}>{rec.endRound}</span>
        <span style={dt.label}>전적</span><span style={dt.val}>{rec.wins}승 {rec.losses}패</span>
        <span style={dt.label}>라이벌 처치</span><span style={dt.val}>{rec.rivalsDefeated}</span>
      </div>
      <div style={dt.row}>
        <span style={dt.label}>성장 스탯</span>
        <span style={dt.val}>
          VIT {rec.growthStats.vit} · STR {rec.growthStats.str} · AGI {rec.growthStats.agi} · INT {rec.growthStats.int} · LUK {rec.growthStats.luk}
        </span>
      </div>
      <div style={dt.skillRow}>
        <span style={dt.label}>스킬</span>
        <div style={dt.chips}>
          {rec.skills.map((id, i) => {
            const def   = SKILLS_BY_ID[id] as SkillDef | undefined
            const color = def ? TIER_COLOR[def.tier] : '#666'
            return (
              <span key={`${id}-${i}`} style={{ ...dt.chip, borderColor: color, color }}>
                {def?.name ?? id}
              </span>
            )
          })}
        </div>
      </div>
      {rec.items.length > 0 && (
        <div style={dt.row}>
          <span style={dt.label}>아이템</span>
          <span style={dt.val}>{rec.items.length}개 보유</span>
        </div>
      )}
    </div>
  )
}

export default function MyRecordsPage() {
  const { activeSlot } = useGameStore()
  const [expanded, setExpanded] = useState<number | null>(null)

  const records = activeSlot?.runRecords ?? []

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 돌아가기
        </button>
        <h2 style={s.title}>내 기록</h2>
        <span style={s.sub}>{records.length}건</span>
      </div>

      {records.length === 0 ? (
        <div style={s.empty}>아직 기록이 없습니다.<br />토너먼트를 완료하면 기록이 쌓입니다.</div>
      ) : (
        <div style={s.list}>
          {records.map((rec, i) => {
            const isOpen = expanded === i
            return (
              <div key={i} style={s.card}>
                <button style={s.cardHeader} onClick={() => setExpanded(isOpen ? null : i)}>
                  <span style={s.rank}>#{i + 1}</span>
                  <span style={s.score}>{rec.score.toLocaleString()}pt</span>
                  <span style={s.cName}>{charName(rec.characterId)}</span>
                  <span style={s.round}>R{rec.endRound}</span>
                  <span style={s.date}>{formatDate(rec.finishedAt)}</span>
                  <span style={s.chevron}>{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && <RecordDetail rec={rec} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1rem', gap: '0.5rem' },
  topBar:     { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' },
  title:      { fontSize: '1.3rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' as const },
  sub:        { fontSize: '0.8rem', color: '#666', minWidth: '40px', textAlign: 'right' as const },
  btnBack:    { background: 'transparent', border: '1px solid #444', borderRadius: '6px', color: '#aaa', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' as const },
  empty:      { color: '#666', textAlign: 'center' as const, marginTop: '3rem', fontSize: '0.9rem', lineHeight: 1.7 },
  list:       { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: '560px', width: '100%', margin: '0 auto' },
  card:       { background: '#14142a', border: '1px solid #2a2a3e', borderRadius: '10px', overflow: 'hidden' },
  cardHeader: { width: '100%', background: 'transparent', border: 'none', color: '#e8e8ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', textAlign: 'left' as const },
  rank:       { fontSize: '0.7rem', color: '#555', minWidth: '22px' },
  score:      { fontSize: '1rem', fontWeight: 900, color: '#ffd700', minWidth: '80px' },
  cName:      { fontSize: '0.85rem', fontWeight: 700, color: '#c0aaff', flex: 1 },
  round:      { fontSize: '0.75rem', color: '#888' },
  date:       { fontSize: '0.7rem', color: '#555' },
  chevron:    { fontSize: '0.6rem', color: '#555', marginLeft: '0.25rem' },
}

const dt: Record<string, React.CSSProperties> = {
  detail:   { padding: '0.75rem 1rem', borderTop: '1px solid #2a2a3e', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#0d0d1a' },
  row:      { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem 1rem', alignItems: 'center' },
  label:    { fontSize: '0.65rem', color: '#555', textTransform: 'uppercase' as const },
  val:      { fontSize: '0.8rem', color: '#bbb' },
  skillRow: { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' as const },
  chips:    { display: 'flex', flexWrap: 'wrap' as const, gap: '0.25rem', flex: 1 },
  chip:     { fontSize: '0.7rem', border: '1px solid', borderRadius: '3px', padding: '1px 5px', background: '#1a1a2e' },
}
