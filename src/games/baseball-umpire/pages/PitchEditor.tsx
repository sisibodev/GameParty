import { useEffect, useState } from 'react'
import { PitchType, PitcherForm } from '../types'
import { FullPitchConfig, getDefaultPitchConfig, applyPitchConfig } from '../utils/pitch'
import { loadPitchConfig, savePitchConfig } from '../utils/pitchConfig'
import { clearRankings } from '../utils/firestore'
import PitchPreview3D from '../components/PitchPreview3D'

interface Props { onBack: () => void }

const PITCH_TYPES: { id: PitchType; label: string }[] = [
  { id: 'fastball',  label: '직구' },
  { id: 'two_seam',  label: '투심' },
  { id: 'sinker',    label: '싱커' },
  { id: 'cutter',    label: '커터' },
  { id: 'changeup',  label: '체인지업' },
  { id: 'slider',    label: '슬라이더' },
  { id: 'sweeper',   label: '스위퍼' },
  { id: 'curve',     label: '커브' },
  { id: 'splitter',  label: '스플리터' },
  { id: 'forkball',  label: '포크볼' },
]

const PITCHER_FORMS: { id: PitcherForm; label: string }[] = [
  { id: 'overhand',      label: '오버핸드' },
  { id: 'three_quarter', label: '스리쿼터' },
  { id: 'sidearm',       label: '사이드암' },
  { id: 'underhand',     label: '언더핸드' },
]

function NumField({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; hint?: string
}) {
  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>
        {label}
        {hint && <span style={s.fieldHint}>{hint}</span>}
      </div>
      <div style={s.fieldControls}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} style={s.slider} />
        <input type="number" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} style={s.numInput} />
      </div>
    </div>
  )
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>{label}</div>
      <button style={{ ...s.boolBtn, background: value ? 'rgba(255,87,34,0.3)' : 'rgba(255,255,255,0.07)', borderColor: value ? '#ff5722' : 'rgba(255,255,255,0.15)' }}
        onClick={() => onChange(!value)}>
        {value ? '✓ ON' : '✗ OFF'}
      </button>
    </div>
  )
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <div style={s.sectionTitle}>{children}</div>
}

function ArcPreview({ y1, y2, t1, t2 }: { y1: number; y2: number; t1: number; t2: number }) {
  const W = 220, H = 80
  const px = (t: number) => t * W
  const py = (y: number) => H / 2 - y * 100
  const p0 = [0, py(0)], p1 = [px(t1), py(y1)], p2 = [px(t2), py(y2)], p3 = [W, py(0)]
  const d = `M ${p0[0]},${p0[1]} C ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`
  return (
    <svg width={W} height={H} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, display: 'block' }}>
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={W-1} y1={8} x2={W-1} y2={H-8} stroke="rgba(0,229,255,0.4)" strokeWidth={2} />
      <line x1={1} y1={8} x2={1} y2={H-8} stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <path d={d} fill="none" stroke="#4fc3f7" strokeWidth={2} />
      <circle cx={p1[0]} cy={p1[1]} r={3.5} fill="#ffcc00" opacity={0.85} />
      <circle cx={p2[0]} cy={p2[1]} r={3.5} fill="#ff8a65" opacity={0.85} />
      <text x={3} y={12} fontSize={8} fill="rgba(255,255,255,0.35)">마운드</text>
      <text x={W-38} y={12} fontSize={8} fill="rgba(0,229,255,0.5)">홈플</text>
    </svg>
  )
}

export default function PitchEditor({ onBack }: Props) {
  const [config, setConfig] = useState<FullPitchConfig>(() => getDefaultPitchConfig())
  const [selectedType, setSelectedType] = useState<PitchType>('fastball')
  const [selectedForm, setSelectedForm] = useState<PitcherForm>('overhand')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(true)
  const [previewSeed, setPreviewSeed] = useState(0)

  // 랭킹 초기화
  const [clearDiff, setClearDiff]     = useState<string>('전체')
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'done' | 'error'>('idle')
  const [clearCount, setClearCount]   = useState<number>(0)

  async function handleClearRankings() {
    const target = clearDiff === '전체' ? undefined : clearDiff
    const label  = clearDiff === '전체' ? '전체 랭킹' : `${clearDiff} 랭킹`
    if (!confirm(`⚠️ ${label}을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    setClearStatus('clearing')
    try {
      const n = await clearRankings(target)
      setClearCount(n)
      setClearStatus('done')
    } catch (e) {
      console.error('[PitchEditor] 랭킹 초기화 실패:', e)
      setClearStatus('error')
    }
  }

  useEffect(() => {
    loadPitchConfig().then(c => { if (c) setConfig(c) }).finally(() => setLoading(false))
  }, [])

  const mv  = config.pitchMovement[selectedType]
  const bp  = config.pitchBreak[selectedType]
  const fm  = config.formMult[selectedForm]
  const fbm = config.formBreakMult[selectedForm]

  const updateMv  = (field: string, val: number | boolean) => setConfig(prev => ({ ...prev, pitchMovement:  { ...prev.pitchMovement,  [selectedType]: { ...prev.pitchMovement[selectedType],  [field]: val } } }))
  const updateBp  = (field: string, val: number)           => setConfig(prev => ({ ...prev, pitchBreak:     { ...prev.pitchBreak,     [selectedType]: { ...prev.pitchBreak[selectedType],     [field]: val } } }))
  const updateFm  = (field: string, val: number)           => setConfig(prev => ({ ...prev, formMult:       { ...prev.formMult,       [selectedForm]: { ...prev.formMult[selectedForm],       [field]: val } } }))
  const updateFbm = (field: string, val: number)           => setConfig(prev => ({ ...prev, formBreakMult:  { ...prev.formBreakMult,  [selectedForm]: { ...prev.formBreakMult[selectedForm],  [field]: val } } }))

  async function handleSave() {
    setSaveStatus('saving')
    try {
      await savePitchConfig(config)
      applyPitchConfig(config)
      setSaveStatus('saved')
    } catch (e) {
      console.error('[PitchEditor] 저장 실패:', e)
      setSaveStatus('error')
    }
  }

  if (loading) return <div style={s.wrap}><div style={{ color: '#aaa', margin: 'auto' }}>설정 로드 중...</div></div>

  return (
    <div style={s.wrap}>
      {/* ── 헤더 ── */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← 뒤로</button>
        <div style={s.headerTitle}>⚙️ 구종 무브먼트 편집 (관리자)</div>
        <div style={s.headerActions}>
          <button style={s.resetBtn} onClick={() => { if (confirm('기본값으로 초기화?')) { setConfig(getDefaultPitchConfig()); setSaveStatus('idle') } }}>초기화</button>
          <button style={{ ...s.saveBtn, opacity: saveStatus === 'saving' ? 0.6 : 1 }} onClick={handleSave} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? '저장 중...' : '💾 저장 & 적용'}
          </button>
          {saveStatus === 'saved' && <span style={s.statusOk}>✓ 저장됨</span>}
          {saveStatus === 'error' && <span style={s.statusErr}>✗ 실패</span>}
        </div>
      </div>

      {/* ── 랭킹 초기화 패널 ── */}
      <div style={s.clearPanel}>
        <span style={s.clearTitle}>🗑 랭킹 초기화</span>
        <select
          style={s.clearSelect}
          value={clearDiff}
          onChange={e => { setClearDiff(e.target.value); setClearStatus('idle') }}
        >
          {['전체', '루키', '아마추어', '프로', '메이저'].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button
          style={{ ...s.clearBtn, opacity: clearStatus === 'clearing' ? 0.5 : 1 }}
          onClick={handleClearRankings}
          disabled={clearStatus === 'clearing'}
        >
          {clearStatus === 'clearing' ? '삭제 중...' : '초기화'}
        </button>
        {clearStatus === 'done'  && <span style={s.clearOk}>✓ {clearCount}건 삭제됨</span>}
        {clearStatus === 'error' && <span style={s.clearErr}>✗ 실패</span>}
      </div>

      {/* ── 바디 (3열) ── */}
      <div style={s.body}>

        {/* ── 열1: 폼/구종 선택 ── */}
        <div style={s.leftPanel}>
          <div style={s.panelLabel}>투구폼</div>
          {PITCHER_FORMS.map(f => (
            <button key={f.id}
              style={{ ...s.selBtn, ...(selectedForm === f.id ? s.selBtnOn : {}) }}
              onClick={() => setSelectedForm(f.id)}>
              {f.label}
            </button>
          ))}
          <div style={{ ...s.panelLabel, marginTop: 16 }}>구종</div>
          {PITCH_TYPES.map(pt => (
            <button key={pt.id}
              style={{ ...s.selBtn, ...(selectedType === pt.id ? s.selBtnOn : {}) }}
              onClick={() => setSelectedType(pt.id)}>
              {pt.label}
            </button>
          ))}
        </div>

        {/* ── 열2: 편집 필드 ── */}
        <div style={s.midPanel}>
          <div style={s.editorTitle}>
            {PITCHER_FORMS.find(f => f.id === selectedForm)?.label} / {PITCH_TYPES.find(t => t.id === selectedType)?.label}
          </div>

          <SecTitle>📍 무브먼트 (홈플레이트 도달 위치)</SecTitle>
          <div style={s.desc}>폼 배율·±15% 편차 전 기준값. 우투수 기준 (+x=1루, -x=3루)</div>
          <NumField label="xBase (횡 기준)"  value={mv.xBase}  min={-0.6} max={0.6}  step={0.01} onChange={v => updateMv('xBase', v)}  hint="(-)좌 ← → (+)우" />
          <NumField label="xRange (횡 편차)" value={mv.xRange} min={0}    max={0.2}  step={0.01} onChange={v => updateMv('xRange', v)} hint="±변동폭" />
          <NumField label="yBase (수직 기준)" value={mv.yBase}  min={-0.6} max={0.15} step={0.01} onChange={v => updateMv('yBase', v)}  hint="(-)낙하 ← → (+)상승" />
          <NumField label="yRange (수직 편차)" value={mv.yRange} min={0}   max={0.2}  step={0.01} onChange={v => updateMv('yRange', v)} hint="±변동폭" />
          <BoolField label="forceDown (낙하 강제)" value={!!mv.forceDown} onChange={v => updateMv('forceDown', v)} />

          <SecTitle>🌀 궤적 아크 (베지어 제어점)</SecTitle>
          <div style={s.desc}>t=0 마운드 · t=1 홈플레이트 / x=횡 이탈, y=수직 오프셋 (직선 대비)</div>
          <div style={{ marginBottom: 10 }}>
            <ArcPreview y1={bp.y1 * fbm.y1} y2={bp.y2 * fbm.y2} t1={bp.t1} t2={bp.t2} />
            <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>🟡 제어점1 &nbsp; 🟠 제어점2</div>
          </div>
          <NumField label="t1 (제어점1 위치)" value={bp.t1} min={0.1} max={0.6}  step={0.01} onChange={v => updateBp('t1', v)} hint="0~1" />
          <NumField label="x1 (제어점1 횡)"   value={bp.x1} min={-0.3} max={0.3} step={0.01} onChange={v => updateBp('x1', v)} hint="(-)좌 ← → (+)우" />
          <NumField label="y1 (제어점1 높이)" value={bp.y1} min={-0.4} max={0.4} step={0.01} onChange={v => updateBp('y1', v)} hint="(-)아래 ← → (+)위" />
          <NumField label="t2 (제어점2 위치)" value={bp.t2} min={0.4} max={0.95} step={0.01} onChange={v => updateBp('t2', v)} hint="0~1" />
          <NumField label="x2 (제어점2 횡)"   value={bp.x2} min={-0.3} max={0.3} step={0.01} onChange={v => updateBp('x2', v)} hint="(-)좌 ← → (+)우" />
          <NumField label="y2 (제어점2 높이)" value={bp.y2} min={-0.5} max={0.2} step={0.01} onChange={v => updateBp('y2', v)} hint="(-)아래 ← → (+)위" />

          <SecTitle>✖️ 폼 배율 ({PITCHER_FORMS.find(f => f.id === selectedForm)?.label})</SecTitle>
          <div style={s.desc}>이 폼의 무브먼트 배율. 폼이 다르면 같은 구종도 다르게 움직임.</div>
          <NumField label="무브먼트 x 배율" value={fm.x}    min={0.1} max={3.0} step={0.05} onChange={v => updateFm('x', v)}    hint="횡 강도" />
          <NumField label="무브먼트 y 배율" value={fm.y}    min={0.1} max={2.0} step={0.05} onChange={v => updateFm('y', v)}    hint="수직 강도" />
          <NumField label="아크 x1 배율"    value={fbm.x1}  min={0.0} max={2.5} step={0.05} onChange={v => updateFbm('x1', v)} hint="제어점1 횡 배율" />
          <NumField label="아크 x2 배율"    value={fbm.x2}  min={0.0} max={2.5} step={0.05} onChange={v => updateFbm('x2', v)} hint="제어점2 횡 배율" />
          <NumField label="아크 y1 배율"    value={fbm.y1}  min={0.0} max={2.0} step={0.05} onChange={v => updateFbm('y1', v)} hint="제어점1 수직 배율" />
          <NumField label="아크 y2 배율"    value={fbm.y2}  min={0.0} max={2.0} step={0.05} onChange={v => updateFbm('y2', v)} hint="제어점2 수직 배율" />

          <div style={s.note}>
            💡 오른쪽 미리보기에서 슬라이더 값이 즉시 반영됩니다. 저장하면 모든 클라이언트에 적용됩니다.
          </div>
        </div>

        {/* ── 열3: 3D 투구 미리보기 ── */}
        <PitchPreview3D
          pitchType={selectedType}
          form={selectedForm}
          config={config}
          randomSeed={previewSeed}
          onRethrow={() => setPreviewSeed(s => s + 1)}
        />

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    height: '100vh', background: 'linear-gradient(135deg,#080f1c 0%,#0f1f36 100%)',
    color: '#fff', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 20px', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.35)', flexWrap: 'wrap',
  },
  backBtn: {
    background: 'none', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  },
  headerTitle: { fontSize: 15, fontWeight: 700, color: '#ff8a65', flex: 1 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
  resetBtn: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
    color: '#aaa', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
  },
  saveBtn: {
    background: 'rgba(76,175,80,0.25)', border: '1px solid #4caf50',
    color: '#81c784', padding: '5px 16px', borderRadius: 6, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
  },
  statusOk: { color: '#4caf50', fontSize: 12 },
  statusErr: { color: '#f44336', fontSize: 12 },

  // 랭킹 초기화 패널
  clearPanel: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 20px',
    background: 'rgba(244,67,54,0.06)',
    borderBottom: '1px solid rgba(244,67,54,0.18)',
  },
  clearTitle: { fontSize: 12, fontWeight: 700, color: '#ef9a9a', flexShrink: 0 },
  clearSelect: {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff', borderRadius: 5, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
  },
  clearBtn: {
    background: 'rgba(244,67,54,0.2)', border: '1px solid rgba(244,67,54,0.5)',
    color: '#ef9a9a', padding: '4px 14px', borderRadius: 5,
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
  },
  clearOk:  { color: '#4caf50', fontSize: 11 },
  clearErr: { color: '#f44336', fontSize: 11 },

  body: {
    display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0,
  },
  leftPanel: {
    width: 130, flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    padding: '12px 8px', overflowY: 'auto',
    background: 'rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  panelLabel: {
    fontSize: 10, color: 'rgba(0,229,255,0.65)', fontWeight: 700,
    letterSpacing: 1, textTransform: 'uppercase' as const,
    marginBottom: 3, marginTop: 4,
  },
  selBtn: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
    color: '#bbb', padding: '5px 8px', borderRadius: 5, cursor: 'pointer',
    fontSize: 12, textAlign: 'left' as const,
  },
  selBtnOn: {
    background: 'rgba(0,229,255,0.14)', border: '1px solid rgba(0,229,255,0.5)',
    color: '#00e5ff', fontWeight: 700,
  },
  midPanel: {
    width: 400, flexShrink: 0,
    borderRight: '1px solid rgba(255,255,255,0.07)',
    padding: '16px 20px', overflowY: 'auto',
  },
  editorTitle: {
    fontSize: 15, fontWeight: 700, color: '#fff',
    marginBottom: 14, paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: 700, color: '#ffcc00',
    marginTop: 20, marginBottom: 5,
  },
  desc: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 10, lineHeight: 1.5 },
  fieldRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 8, minHeight: 28,
  },
  fieldLabel: { fontSize: 11, color: '#bbb', width: 150, flexShrink: 0 },
  fieldHint:  { display: 'block', fontSize: 9, color: '#555', marginTop: 1 },
  fieldControls: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 },
  slider:   { flex: 1, accentColor: '#00e5ff', cursor: 'pointer' },
  numInput: {
    width: 60, background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff', borderRadius: 4, padding: '2px 5px',
    fontSize: 12, textAlign: 'right' as const,
  },
  boolBtn: {
    padding: '3px 12px', borderRadius: 4, border: '1px solid',
    color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700,
  },
  note: {
    marginTop: 20, padding: '10px 14px',
    background: 'rgba(255,204,0,0.07)',
    border: '1px solid rgba(255,204,0,0.18)',
    borderRadius: 7, fontSize: 11,
    color: 'rgba(255,204,0,0.75)', lineHeight: 1.6,
  },
}
