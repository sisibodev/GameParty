interface StatBarProps {
  name: string
  value: number
  max?: number
  color?: string
}

export default function StatBar({ name, value, max = 200, color }: StatBarProps) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'36px 1fr 48px', gap:10, alignItems:'center', fontSize:13 }}>
      <div className="arena-mono" style={{ color:'var(--ink-dim)', fontSize:12 }}>{name}</div>
      <div className="arena-stat-bar">
        <div className="arena-stat-fill" style={{ width:`${(value/max)*100}%`, background:color||undefined }}/>
      </div>
      <div className="arena-mono" style={{ textAlign:'right', fontWeight:700 }}>{value}</div>
    </div>
  )
}
