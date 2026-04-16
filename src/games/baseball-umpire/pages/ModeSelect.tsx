import { useState } from 'react'
import { GameMode, Difficulty, TrajectoryMode, DIFFICULTY_CONFIG } from '../types'

interface Props {
  onStart: (mode: GameMode, difficulty: Difficulty, trajectoryMode: TrajectoryMode) => void
  onMultiBattle: () => void
  onBack: () => void
}

export default function ModeSelect({ onStart, onMultiBattle, onBack }: Props) {
  const [step, setStep] = useState<'mode' | 'difficulty'>('mode')
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)

  const modes: { id: GameMode; label: string; desc: string; emoji: string }[] = [
    {
      id: 'practice',
      label: '연습 모드',
      desc: '스트라이크존 항상 표시 · 판정 직후 정답 공개 · 기록 저장 안 함',
      emoji: '🎯',
    },
    {
      id: 'normal',
      label: '일반 모드',
      desc: '9타자 정규 진행 · 기록 Firestore 저장',
      emoji: '⚾',
    },
  ]

  const difficulties: { id: Difficulty; emoji: string }[] = [
    { id: 'rookie',  emoji: '⭐' },
    { id: 'amateur', emoji: '⭐⭐' },
    { id: 'pro',     emoji: '⭐⭐⭐' },
    { id: 'major',   emoji: '⭐⭐⭐⭐' },
  ]

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode)
    setStep('difficulty')
  }

  const handleDifficultySelect = (diff: Difficulty) => {
    // 물리 시뮬레이션 모드는 숨김 — 베지어 고정으로 바로 시작
    if (selectedMode) onStart(selectedMode, diff, 'bezier')
  }

  const handleBack = () => {
    if (step === 'difficulty') { setStep('mode'); return }
    onBack()
  }

  const backLabel =
    step === 'difficulty' ? '모드 선택' : '로비로'

  return (
    <div style={styles.wrap}>
      <button style={styles.backBtn} onClick={handleBack}>
        ← {backLabel}
      </button>

      <div style={styles.title}>⚾ Strike Zone</div>
      <div style={styles.subtitle}>야구 주심 판정 게임</div>

      {step === 'mode' && (
        <>
          <div style={styles.stepLabel}>게임 모드 선택</div>
          <div style={styles.modes}>
            {modes.map(m => (
              <button key={m.id} style={styles.card} onClick={() => handleModeSelect(m.id)}>
                <div style={styles.emoji}>{m.emoji}</div>
                <div style={styles.cardTitle}>{m.label}</div>
                <div style={styles.cardDesc}>{m.desc}</div>
              </button>
            ))}
            <button style={{ ...styles.card, borderColor: 'rgba(255,152,0,0.5)' }} onClick={onMultiBattle}>
              <div style={styles.emoji}>🏆</div>
              <div style={styles.cardTitle}>멀티 배틀</div>
              <div style={styles.cardDesc}>최대 10인 · 같은 투구를 동시에 판정 · 정확도/점수 비교</div>
            </button>
          </div>

          <div style={styles.diffTable}>
            <div style={styles.sectionTitle}>난이도 안내</div>
            <table style={{ borderCollapse: 'collapse', color: '#eee', fontSize: 13, width: '100%' }}>
              <thead>
                <tr style={{ color: '#9ecaf8' }}>
                  {['레벨', '속도', '사용 구종', '보더라인'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {difficulties.map(({ id, emoji }) => {
                  const c = DIFFICULTY_CONFIG[id]
                  return (
                    <tr key={id}>
                      <td style={td}>{emoji} {c.label}</td>
                      <td style={td}>{c.speedMin}~{c.speedMax}km/h</td>
                      <td style={td}>직구 + 변화구 {c.breakingBallCount}종</td>
                      <td style={td}>{(c.borderlineRatio * 100).toFixed(0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {step === 'difficulty' && selectedMode && (
        <>
          <div style={styles.stepLabel}>
            {modes.find(m => m.id === selectedMode)?.emoji}{' '}
            {modes.find(m => m.id === selectedMode)?.label} — 난이도 선택
          </div>
          <div style={styles.diffCards}>
            {difficulties.map(({ id, emoji }) => {
              const c = DIFFICULTY_CONFIG[id]
              return (
                <button
                  key={id}
                  style={styles.diffCard}
                  onClick={() => handleDifficultySelect(id)}
                >
                  <div style={styles.diffEmoji}>{emoji}</div>
                  <div style={styles.diffLabel}>{c.label}</div>
                  <div style={styles.diffDetail}>{c.speedMin}~{c.speedMax} km/h</div>
                  <div style={styles.diffDetail}>
                    직구 + 변화구 {c.breakingBallCount}종
                  </div>
                  <div style={styles.pitchChips}>
                    <span style={styles.pitchChipFixed}>직구</span>
                    {Array.from({ length: c.breakingBallCount }, (_, i) => (
                      <span key={i} style={styles.pitchChipRandom}>?</span>
                    ))}
                  </div>
                  <div style={styles.randomNote}>매 게임 랜덤 선택</div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 물리 시뮬레이션 모드 선택 UI — 추후 공개 예정 */}
    </div>
  )
}

const th: React.CSSProperties = { padding: '5px 14px', textAlign: 'center', fontWeight: 600 }
const td: React.CSSProperties = {
  padding: '6px 14px',
  textAlign: 'center',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    padding: '32px 20px',
    fontFamily: 'sans-serif',
  },
  backBtn: {
    position: 'absolute',
    top: 20, left: 20,
    background: 'none',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  },
  title: { fontSize: 48, fontWeight: 900, letterSpacing: 4, marginBottom: 4 },
  subtitle: { fontSize: 18, color: '#9ecaf8', marginBottom: 32 },
  stepLabel: { fontSize: 16, color: '#aac', marginBottom: 20, fontWeight: 600 },
  modes: { display: 'flex', gap: 24, marginBottom: 36, flexWrap: 'wrap', justifyContent: 'center' },
  card: {
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: '28px 36px',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: 200,
    transition: 'background 0.2s',
  },
  emoji: { fontSize: 40, marginBottom: 10 },
  cardTitle: { fontSize: 20, fontWeight: 700, marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#aac', lineHeight: 1.6, maxWidth: 220 },
  diffTable: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: '16px 24px',
    width: '100%',
    maxWidth: 580,
  },
  sectionTitle: { fontSize: 13, color: '#9ecaf8', marginBottom: 10, fontWeight: 700 },
  diffCards: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  diffCard: {
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: '22px 28px',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: 130,
    transition: 'background 0.2s, border-color 0.2s',
  },
  diffEmoji: { fontSize: 28, marginBottom: 8 },
  diffLabel: { fontSize: 18, fontWeight: 700, marginBottom: 10 },
  diffDetail: { fontSize: 12, color: '#aac', lineHeight: 1.8 },
  pitchChips: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
    gap: 4, marginTop: 10,
  },
  pitchChipFixed: {
    fontSize: 10, color: '#fff',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 4, padding: '2px 6px', fontWeight: 700,
  },
  pitchChipRandom: {
    fontSize: 10, color: '#ffcc00',
    background: 'rgba(255,204,0,0.12)',
    border: '1px solid rgba(255,204,0,0.35)',
    borderRadius: 4, padding: '2px 8px', fontWeight: 700,
  },
  randomNote: {
    fontSize: 10, color: 'rgba(255,204,0,0.7)',
    marginTop: 5,
  },
}
