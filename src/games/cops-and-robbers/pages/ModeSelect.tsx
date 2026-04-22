interface ModeSelectProps {
  onSolo: () => void
  onMulti: () => void
  onRanking: () => void
  onBack: () => void
  name: string
  onNameChange: (name: string) => void
}

export default function ModeSelect({ onSolo, onMulti, onRanking, onBack, name, onNameChange }: ModeSelectProps) {
  return (
    <div style={rootStyle}>
      <div style={cardStyle}>
        <div style={titleRowStyle}>
          <div style={thumbStyle}>🕵️</div>
          <div>
            <h1 style={titleStyle}>경찰과 도둑</h1>
            <p style={subtitleStyle}>M2 · 싱글 + RTDB 멀티(2~4인)</p>
          </div>
        </div>

        <p style={descStyle}>
          경찰 봇이 맵을 순찰하며 도둑을 추적합니다. 금고를 털어 보물을 모으고,
          3번 피격 전에 탈출하세요. 은신·연막으로 경찰을 따돌릴 수 있습니다.
        </p>

        <div style={controlBoxStyle}>
          <div style={controlTitleStyle}>조작</div>
          <ul style={controlListStyle}>
            <li>이동: W A S D · 가속: Shift</li>
            <li>금고 해킹: 근처에서 E</li>
            <li>은신: Z (4초 지속 / 15초 쿨타임)</li>
            <li>연막: X (6초 지속 / 20초 쿨타임)</li>
            <li>피격 3회 → 체포 · 목표: 보물 5개 확보</li>
          </ul>
        </div>

        <div style={nameRowStyle}>
          <label style={nameLabelStyle}>닉네임</label>
          <input
            style={nameInputStyle}
            value={name}
            maxLength={12}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>

        <div style={buttonRowStyle}>
          <button style={secondaryButtonStyle} onClick={onBack}>
            로비로
          </button>
          <button style={secondaryButtonStyle} onClick={onRanking}>
            🏆 랭킹
          </button>
          <button style={secondaryButtonStyle} onClick={onSolo}>
            혼자 하기
          </button>
          <button style={primaryButtonStyle} onClick={onMulti}>
            멀티 (2~4인) →
          </button>
        </div>
      </div>
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at 30% 10%, #141a28 0%, #05070d 55%)',
  color: '#e4e7ef',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: '#0f131d',
  border: '1px solid #1c2331',
  borderRadius: 14,
  padding: 28,
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
}

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  marginBottom: 18,
}

const thumbStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 12,
  background: '#1a2030',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 30,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
}

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#8a93a6',
  fontSize: 13,
}

const descStyle: React.CSSProperties = {
  color: '#c8cfdd',
  lineHeight: 1.6,
  fontSize: 14,
  margin: '0 0 18px',
}

const controlBoxStyle: React.CSSProperties = {
  background: '#121725',
  border: '1px solid #1f2638',
  borderRadius: 10,
  padding: 16,
  marginBottom: 22,
}

const controlTitleStyle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#7dd3fc',
  marginBottom: 8,
}

const controlListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 13,
  color: '#c8cfdd',
  lineHeight: 1.8,
}

const nameRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 18,
}

const nameLabelStyle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  color: '#7dd3fc',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const nameInputStyle: React.CSSProperties = {
  flex: 1,
  background: '#121725',
  border: '1px solid #2a3345',
  color: '#e4e7ef',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
}

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
}

const primaryButtonStyle: React.CSSProperties = {
  background: '#38bdf8',
  color: '#05070d',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

const secondaryButtonStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '10px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
}
