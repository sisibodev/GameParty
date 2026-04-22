import { UPDATE_HISTORY, UpdateCategory } from '../data/updateNotes'

interface Props {
  onClose: () => void
}

const CATEGORY_STYLE: Record<UpdateCategory, { bg: string; border: string; color: string; label: string }> = {
  '기능 추가': { bg: 'rgba(33,150,243,0.18)',  border: '#2196f3', color: '#64b5f6', label: '🆕 기능' },
  '구종 수정': { bg: 'rgba(255,193,7,0.18)',   border: '#ffc107', color: '#ffd54f', label: '⚾ 구종' },
  '버그 수정': { bg: 'rgba(244,67,54,0.18)',   border: '#f44336', color: '#ef9a9a', label: '🐛 버그' },
  '밸런스':   { bg: 'rgba(76,175,80,0.18)',    border: '#4caf50', color: '#a5d6a7', label: '⚖️ 밸런스' },
  'UI':       { bg: 'rgba(156,39,176,0.18)',   border: '#9c27b0', color: '#ce93d8', label: '🎨 UI' },
}

export default function UpdateNotesModal({ onClose }: Props) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={styles.header}>
          <div style={styles.title}>📋 업데이트 노트</div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 버전 목록 */}
        <div style={styles.list}>
          {UPDATE_HISTORY.map(entry => (
            <div key={entry.version} style={styles.section}>
              <div style={styles.versionRow}>
                <span style={styles.version}>v{entry.version}</span>
                <span style={styles.date}>{entry.date}</span>
              </div>
              <div style={styles.changes}>
                {entry.changes.map((c, i) => {
                  const s = CATEGORY_STYLE[c.category]
                  return (
                    <div key={i} style={styles.changeRow}>
                      <span style={{
                        ...styles.badge,
                        background: s.bg,
                        border: `1px solid ${s.border}`,
                        color: s.color,
                      }}>
                        {s.label}
                      </span>
                      <span style={styles.changeText}>{c.text}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'linear-gradient(135deg, #0d1b2a 0%, #1a2e44 100%)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 16,
    width: 520,
    maxWidth: '92vw',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: 1,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#aaa',
    borderRadius: 8,
    width: 32,
    height: 32,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    overflowY: 'auto',
    padding: '12px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  versionRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  version: {
    fontSize: 16,
    fontWeight: 900,
    color: '#00e5ff',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 11,
    color: '#666',
  },
  changes: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingLeft: 4,
  },
  changeRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 4,
    padding: '2px 6px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    marginTop: 1,
  },
  changeText: {
    fontSize: 13,
    color: '#dde',
    lineHeight: 1.5,
  },
}
