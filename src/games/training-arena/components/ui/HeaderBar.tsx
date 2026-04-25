import '../../styles/arena.css'

interface HeaderBarProps {
  title?: string
  subtitle?: string
  round?: number | null
  gold?: number | null
  phase?: string
  onExit?: (() => void) | null
}

export default function HeaderBar({ title = '배틀 그랑프리', subtitle, round, gold, phase, onExit }: HeaderBarProps) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:'1px solid var(--line)', background:'linear-gradient(180deg, rgba(20,14,36,.85), rgba(15,10,26,.6))' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#a478ff,#ff7ab6)', display:'grid', placeItems:'center', fontFamily:'Black Han Sans, sans-serif', fontSize:18, color:'#fff', boxShadow:'0 0 18px rgba(164,120,255,.5)' }}>배</div>
        <div>
          <div className="arena-kr" style={{ fontSize:18, lineHeight:1 }}>{title}</div>
          {subtitle && <div className="arena-mono" style={{ fontSize:12, color:'var(--ink-mute)', marginTop:4 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {phase && <div className="arena-mono" style={{ display:'flex', gap:4, padding:'6px 10px', borderRadius:999, background:'rgba(255,255,255,.04)', border:'1px solid var(--line)', fontSize:12, color:'var(--ink-dim)' }}>{phase}</div>}
        {round != null && <div className="arena-mono" style={{ padding:'8px 14px', borderRadius:999, background:'rgba(124,80,240,.15)', border:'1px solid rgba(124,80,240,.4)', fontSize:12, fontWeight:700, color:'var(--violet-glow)' }}>ROUND {round}</div>}
        {gold != null && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:999, background:'rgba(255,214,107,.1)', border:'1px solid rgba(255,214,107,.4)' }}>
            <div style={{ width:14, height:14, borderRadius:'50%', background:'radial-gradient(circle at 30% 30%, #fff3b0, #c98a1a)', boxShadow:'0 0 8px rgba(255,214,107,.6)' }}/>
            <span className="arena-mono" style={{ fontWeight:700, color:'#ffd66b' }}>{gold.toLocaleString()}</span>
          </div>
        )}
        {onExit && <button className="arena-btn arena-btn-ghost" onClick={onExit} style={{ width:36, height:36, padding:0, justifyContent:'center', borderRadius:10 }}>✕</button>}
      </div>
    </div>
  )
}
