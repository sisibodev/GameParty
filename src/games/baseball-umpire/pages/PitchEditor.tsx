import { useEffect, useState } from 'react'
import {
  PitchType, PitcherForm,
} from '../types'
import {
  FullPitchConfig,
  getDefaultPitchConfig,
  applyPitchConfig,
} from '../utils/pitch'
import { loadPitchConfig, savePitchConfig } from '../utils/pitchConfig'
import PitchPreview3D from '../components/PitchPreview3D'

interface Props {
  onBack: () => void
}

const PITCH_TYPES: { id: PitchType; label: string }[] = [
  { id: 'fastball',  label: '직구 (Fastball)' },
  { id: 'two_seam',  label: '투심 (2-Seam)' },
  { id: 'sinker',    label: '싱커 (Sinker)' },
  { id: 'cutter',    label: '커터 (Cutter)' },
  { id: 'changeup',  label: '체인지업 (Change-up)' },
  { id: 'slider',    label: '슬라이더 (Slider)' },
  { id: 'sweeper',   label: '스위퍼 (Sweeper)' },
  { id: 'curve',     label: '커브 (Curve)' },
  { id: 'splitter',  label: '스플리터 (Splitter)' },
  { id: 'forkball',  label: '포크볼 (Forkball)' },
]

const PITCHER_FORMS: { id: PitcherForm; label: string }[] = [
  { id: 'overhand',      label: '오버핸드' },
  { id: 'three_quarter', label: '스리쿼터' },
  { id: 'sidearm',       label: '사이드암' },
  { id: 'underhand',     label: '언더핸드' },
]

/** 슬라이더 + 숫자 입력 컴비 */
function NumField({
  label, value, min, max, step, onChange, hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>
        {label}
        {hint && <span style={s.fieldHint}>{hint}</span>}
      </div>
      <div style={s.fieldControls}>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={s.slider}
        />
        <input
          type="number"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={s.numInput}
        />
      </div>
    </div>
  )
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={s.fieldRow}>
      <div style={s.fieldLabel}>{label}</div>
      <button
        style={{ ...s.boolBtn, background: value ? 'rgba(255,87,34,0.3)' : 'rgba(255,255,255,0.07)', borderColor: value ? '#ff5722' : 'rgba(255,255,255,0.15)' }}
        onClick={() => onChange(!value)}
      >
        {value ? '✓ ON' : '✗ OFF'}
      </button>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={s.sectionTitle}>{children}</div>
}

/** 간단한 궤적 프리뷰 SVG (사이드 뷰) */
function TrajectoryPreview({ y1, y2, t1, t2 }: { y1: number; y2: number; t1: number; t2: number }) {
  const W = 260, H = 100
  const px = (t: number) => t * W
  const py = (y: number) => H / 2 - y * 120  // y 오프셋을 픽셀로 (양수=위)

  const p0 = [0, py(0)]
  const p1 = [px(t1), py(y1)]
  const p2 = [px(t2), py(y2)]
  const p3 = [W, py(0)]

  const d = `M ${p0[0]},${p0[1]} C ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`

  return (
    <svg width={W} height={H} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, display: 'block' }}>
      {/* 기준선 */}
      <line x1={0} y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />
      {/* 홈플레이트 */}
      <line x1={W-1} y1={10} x2={W-1} y2={H-10} stroke="rgba(0,229,255,0.4)" strokeWidth={2} />
      {/* 마운드 */}
      <line x1={1} y1={10} x2={1} y2={H-10} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* 궤적 */}
      <path d={d} fill="none" stroke="#4fc3f7" strokeWidth={2.5} />
      {/* 제어점 */}
      <circle cx={p1[0]} cy={p1[1]} r={4} fill="#ffcc00" opacity={0.8} />
      <circle cx={p2[0]} cy={p2[1]} r={4} fill="#ff8a65" opacity={0.8} />
      {/* 라벨 */}
      <text x={4} y={14} fontSize={9} fill="rgba(255,255,255,0.4)">마운드</text>
      <text x={W-42} y={14} fontSize={9} fill="rgba(0,229,255,0.6)">홈플레이트</text>
    </svg>
  )
}

export default function PitchEditor({ onBack }: Props) {
  const [config, setConfig] = useState<FullPitchConfig>(() => getDefaultPitchConfig())
  const [selectedType, setSelectedType] = useState<PitchType>('fastball')
  const [selectedForm, setSelectedForm] = useState<PitcherForm>('overhand')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [loading, setLoading] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

  // Firestore에서 현재 설정 로드
  useEffect(() => {
    loadPitchConfig().then(c => {
      if (c) setConfig(c)
    }).finally(() => setLoading(false))
  }, [])

  // ── 현재 선택된 구종의 무브먼트 수정 헬퍼 ──
  const mv = config.pitchMovement[selectedType]
  const bp = config.pitchBreak[selectedType]
  const fm = config.formMult[selectedForm]
  const fbm = config.formBreakMult[selectedForm]

  function updateMv(field: string, val: number | boolean) {
    setConfig(prev => ({
      ...prev,
      pitchMovement: {
        ...prev.pitchMovement,
        [selectedType]: { ...prev.pitchMovement[selectedType], [field]: val },
      },
    }))
  }

  function updateBp(field: string, val: number) {
    setConfig(prev => ({
      ...prev,
      pitchBreak: {
        ...prev.pitchBreak,
        [selectedType]: { ...prev.pitchBreak[selectedType], [field]: val },
      },
    }))
  }

  function updateFm(field: string, val: number) {
    setConfig(prev => ({
      ...prev,
      formMult: {
        ...prev.formMult,
        [selectedForm]: { ...prev.formMult[selectedForm], [field]: val },
      },
    }))
  }

  function updateFbm(field: string, val: number) {
    setConfig(prev => ({
      ...prev,
      formBreakMult: {
        ...prev.formBreakMult,
        [selectedForm]: { ...prev.formBreakMult[selectedForm], [field]: val },
      },
    }))
  }

  function handleReset() {
    if (!confirm('기본값으로 초기화하시겠습니까?')) return
    setConfig(getDefaultPitchConfig())
    setSaveStatus('idle')
  }

  async function handleSave() {
    setSaveStatus('saving')
    try {
      await savePitchConfig(config)
      applyPitchConfig(config)  // 현재 세션에도 즉시 적용
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  if (loading) {
    return (
      <div style={s.wrap}>
        <div style={{ color: '#aaa', fontSize: 18 }}>설정 로드 중...</div>
      </div>
    )
  }

  return (
    <div style={s.wrap}>
      {/* 헤더 */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← 뒤로</button>
        <div style={s.headerTitle}>⚙️ 구종 무브먼트 편집 (관리자)</div>
        <div style={s.headerActions}>
          <button
            style={s.previewBtn}
            onClick={() => setShowPreview(true)}
          >
            ⚾ 투구 미리보기
          </button>
          <button style={s.resetBtn} onClick={handleReset}>초기화</button>
          <button
            style={{ ...s.saveBtn, opacity: saveStatus === 'saving' ? 0.6 : 1 }}
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? '저장 중...' : '💾 저장 & 적용'}
          </button>
          {saveStatus === 'saved'  && <span style={s.statusOk}>✓ 저장됨</span>}
          {saveStatus === 'error'  && <span style={s.statusErr}>✗ 실패</span>}
        </div>
      </div>

      <div style={s.body}>
        {/* ── 좌측: 선택 패널 ── */}
        <div style={s.leftPanel}>
          <div style={s.panelTitle}>투구폼</div>
          {PITCHER_FORMS.map(f => (
            <button
              key={f.id}
              style={{ ...s.selectorBtn, ...(selectedForm === f.id ? s.selectorBtnActive : {}) }}
              onClick={() => setSelectedForm(f.id)}
            >
              {f.label}
            </button>
          ))}

          <div style={{ ...s.panelTitle, marginTop: 20 }}>구종</div>
          {PITCH_TYPES.map(pt => (
            <button
              key={pt.id}
              style={{ ...s.selectorBtn, ...(selectedType === pt.id ? s.selectorBtnActive : {}) }}
              onClick={() => setSelectedType(pt.id)}
            >
              {pt.label}
            </button>
          ))}
        </div>

        {/* ── 우측: 편집 패널 ── */}
        <div style={s.rightPanel}>
          <div style={s.editorTitle}>
            {PITCHER_FORMS.find(f => f.id === selectedForm)?.label}
            {' / '}
            {PITCH_TYPES.find(t => t.id === selectedType)?.label}
          </div>

          {/* ─ 섹션 1: 무브먼트 ─ */}
          <SectionTitle>📍 홈플레이트 도달 위치 (무브먼트)</SectionTitle>
          <div style={s.sectionDesc}>
            폼 배율·±15% 편차 적용 전 기준값. 우투수 기준 (+x = 1루방향, -x = 3루방향)
          </div>
          <NumField label="xBase (횡 기준)" value={mv.xBase} min={-0.6} max={0.6} step={0.01}
            onChange={v => updateMv('xBase', v)} hint="(-)좌←→(+)우" />
          <NumField label="xRange (횡 편차)" value={mv.xRange} min={0} max={0.2} step={0.01}
            onChange={v => updateMv('xRange', v)} hint="±변동폭" />
          <NumField label="yBase (수직 기준)" value={mv.yBase} min={-0.6} max={0.15} step={0.01}
            onChange={v => updateMv('yBase', v)} hint="(-)낙하←→(+)상승" />
          <NumField label="yRange (수직 편차)" value={mv.yRange} min={0} max={0.2} step={0.01}
            onChange={v => updateMv('yRange', v)} hint="±변동폭" />
          <BoolField label="forceDown (낙하 강제)" value={!!mv.forceDown}
            onChange={v => updateMv('forceDown', v)} />

          {/* ─ 섹션 2: 베지어 궤적 ─ */}
          <SectionTitle>🌀 궤적 아크 (베지어 제어점)</SectionTitle>
          <div style={s.sectionDesc}>
            직선 경로 위 제어점 위치. t=0 마운드, t=1 홈플레이트. y는 직선 대비 Y 오프셋.
          </div>
          <div style={{ marginBottom: 12 }}>
            <TrajectoryPreview y1={bp.y1 * (fbm.y1)} y2={bp.y2 * (fbm.y2)} t1={bp.t1} t2={bp.t2} />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
              🟡 = 제어점1(t1,y1×폼배율) &nbsp; 🟠 = 제어점2(t2,y2×폼배율)
            </div>
          </div>
          <NumField label="t1 (제어점1 위치)" value={bp.t1} min={0.1} max={0.6} step={0.01}
            onChange={v => updateBp('t1', v)} hint="0~1 사이 비율" />
          <NumField label="y1 (제어점1 높이)" value={bp.y1} min={-0.4} max={0.4} step={0.01}
            onChange={v => updateBp('y1', v)} hint="(-)아래←→(+)위" />
          <NumField label="t2 (제어점2 위치)" value={bp.t2} min={0.4} max={0.95} step={0.01}
            onChange={v => updateBp('t2', v)} hint="0~1 사이 비율" />
          <NumField label="y2 (제어점2 높이)" value={bp.y2} min={-0.5} max={0.2} step={0.01}
            onChange={v => updateBp('y2', v)} hint="(-)아래←→(+)위" />

          {/* ─ 섹션 3: 폼별 배율 ─ */}
          <SectionTitle>✖️ 폼 배율 ({PITCHER_FORMS.find(f => f.id === selectedForm)?.label})</SectionTitle>
          <div style={s.sectionDesc}>
            선택한 투구폼의 무브먼트 배율. 폼이 다르면 같은 구종도 다르게 움직임.
          </div>
          <NumField label="무브먼트 x 배율" value={fm.x} min={0.1} max={3.0} step={0.05}
            onChange={v => updateFm('x', v)} hint="횡 무브먼트 강도" />
          <NumField label="무브먼트 y 배율" value={fm.y} min={0.1} max={2.0} step={0.05}
            onChange={v => updateFm('y', v)} hint="수직 무브먼트 강도" />

          <div style={{ marginTop: 8 }}>
            <NumField label="궤적 y1 배율 (아크 초반)" value={fbm.y1} min={0.0} max={2.0} step={0.05}
              onChange={v => updateFbm('y1', v)} hint="제어점1 높이 배율" />
            <NumField label="궤적 y2 배율 (아크 후반)" value={fbm.y2} min={0.0} max={2.0} step={0.05}
              onChange={v => updateFbm('y2', v)} hint="제어점2 높이 배율" />
          </div>

          <div style={s.note}>
            💡 저장하면 Firestore에 반영되어 모든 클라이언트의 다음 게임부터 적용됩니다.
            <br />⚾ <strong>투구 미리보기</strong>는 현재 편집 중인 값을 즉시 반영합니다 (저장 전에도 확인 가능).
          </div>

          {/* 에디터 내 투구 미리보기 버튼 (우측 패널 하단) */}
          <button
            style={s.inlinePrevBtn}
            onClick={() => setShowPreview(true)}
          >
            ⚾ 지금 선택한 설정으로 투구 미리보기
          </button>
        </div>
      </div>

      {/* 투구 미리보기 모달 */}
      {showPreview && (
        <PitchPreview3D
          pitchType={selectedType}
          form={selectedForm}
          config={config}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #080f1c 0%, #0f1f36 100%)',
    color: '#fff',
    fontFamily: 'sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.3)',
    flexWrap: 'wrap',
  },
  backBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ff8a65',
    flex: 1,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  resetBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#aaa',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  saveBtn: {
    background: 'rgba(76,175,80,0.25)',
    border: '1px solid #4caf50',
    color: '#81c784',
    padding: '6px 18px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  statusOk: { color: '#4caf50', fontSize: 13 },
  statusErr: { color: '#f44336', fontSize: 13 },
  previewBtn: {
    background: 'rgba(255,87,34,0.2)',
    border: '1px solid rgba(255,87,34,0.5)',
    color: '#ff8a65',
    padding: '6px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  inlinePrevBtn: {
    marginTop: 20,
    width: '100%',
    background: 'rgba(255,87,34,0.15)',
    border: '1px solid rgba(255,87,34,0.4)',
    color: '#ff8a65',
    padding: '10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftPanel: {
    width: 200,
    minWidth: 160,
    borderRight: '1px solid rgba(255,255,255,0.1)',
    padding: '16px 12px',
    overflowY: 'auto',
    background: 'rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  panelTitle: {
    fontSize: 11,
    color: 'rgba(0,229,255,0.7)',
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 4,
  },
  selectorBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#ccc',
    padding: '6px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  },
  selectorBtnActive: {
    background: 'rgba(0,229,255,0.15)',
    border: '1px solid rgba(0,229,255,0.5)',
    color: '#00e5ff',
    fontWeight: 700,
  },
  rightPanel: {
    flex: 1,
    padding: '20px 28px',
    overflowY: 'auto',
    maxWidth: 600,
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#ffcc00',
    marginTop: 24,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
    lineHeight: 1.5,
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    minHeight: 32,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#bbb',
    width: 170,
    flexShrink: 0,
  },
  fieldHint: {
    display: 'block',
    fontSize: 10,
    color: '#666',
    marginTop: 1,
  },
  fieldControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  slider: {
    flex: 1,
    accentColor: '#00e5ff',
    cursor: 'pointer',
  },
  numInput: {
    width: 68,
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    borderRadius: 5,
    padding: '3px 6px',
    fontSize: 13,
    textAlign: 'right' as const,
  },
  boolBtn: {
    padding: '4px 14px',
    borderRadius: 5,
    border: '1px solid',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  note: {
    marginTop: 28,
    padding: '12px 16px',
    background: 'rgba(255,204,0,0.07)',
    border: '1px solid rgba(255,204,0,0.2)',
    borderRadius: 8,
    fontSize: 12,
    color: 'rgba(255,204,0,0.8)',
    lineHeight: 1.6,
  },
}
