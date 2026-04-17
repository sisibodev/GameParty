import { KBO_TEAMS, KBOTeam, setMyTeam } from '../utils/kboTeams'

interface Props {
  currentTeamId?: string
  onSelect: (team: KBOTeam) => void
  onClose: () => void
}

export default function TeamSelectModal({ currentTeamId, onSelect, onClose }: Props) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.title}>⚾ KBO 선호구단 선택</div>
        <div style={styles.sub}>구단을 선택하면 랭킹에 로고가 표시됩니다</div>
        <div style={styles.grid}>
          {KBO_TEAMS.map(team => {
            const active = currentTeamId === team.id
            return (
              <button
                key={team.id}
                style={{
                  ...styles.teamBtn,
                  borderColor: active ? team.color : 'rgba(255,255,255,0.12)',
                  background: active ? `${team.color}28` : 'rgba(255,255,255,0.04)',
                  boxShadow: active ? `0 0 12px ${team.color}55` : 'none',
                  transform: active ? 'scale(1.06)' : 'scale(1)',
                }}
                onClick={() => { setMyTeam(team.id); onSelect(team) }}
              >
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  style={styles.logo}
                  onError={(e) => {
                    // 로고 로드 실패 시 약어 텍스트로 fallback
                    const el = e.currentTarget
                    el.style.display = 'none'
                    const parent = el.parentElement
                    if (parent && !parent.querySelector('.abbr-fallback')) {
                      const span = document.createElement('span')
                      span.className = 'abbr-fallback'
                      span.textContent = team.abbr
                      span.style.cssText = `font-size:18px;font-weight:900;color:${team.color};`
                      parent.insertBefore(span, el.nextSibling)
                    }
                  }}
                />
                <div style={styles.teamName}>{team.name}</div>
              </button>
            )
          })}
        </div>

        {/* 선택 없이 진행 */}
        <button
          style={styles.clearBtn}
          onClick={() => {
            localStorage.removeItem('kboTeamId')
            onSelect({ id: '', name: '', color: '', abbr: '', logoUrl: '' })
          }}
        >
          선호구단 없이 진행
        </button>

        <button style={styles.closeBtn} onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.80)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: 'rgba(12,22,42,0.98)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '32px 36px',
    color: '#fff',
    fontFamily: 'sans-serif',
    maxWidth: 560,
    width: '90vw',
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 1,
  },
  sub: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10,
    marginBottom: 16,
  },
  teamBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '12px 6px',
    borderRadius: 12,
    border: '2px solid',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  logo: {
    width: 52,
    height: 52,
    objectFit: 'contain',
  },
  teamName: {
    fontSize: 9,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 1.4,
    wordBreak: 'keep-all' as const,
  },
  clearBtn: {
    width: '100%',
    padding: '8px 0',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'transparent',
    color: '#777',
    fontSize: 12,
    cursor: 'pointer',
    marginBottom: 8,
  },
  closeBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent',
    color: '#aaa',
    fontSize: 14,
    cursor: 'pointer',
  },
}
