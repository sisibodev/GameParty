interface SkillChipProps {
  name: string
  tier?: 'common' | 'rare' | 'hero' | 'legend'
  cd?: number
  learning?: number
}

const tierColor: Record<string, string> = {
  common:'#cbd2dd', rare:'#67e8f9', hero:'#c78bff', legend:'#ffd66b'
}

export default function SkillChip({ name, tier = 'common', cd, learning }: SkillChipProps) {
  const c = tierColor[tier]
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 11px', borderRadius:10, background:'rgba(255,255,255,.03)', border:`1px solid ${c}55`, fontSize:12, opacity:learning?0.55:1, flexShrink:0 }}>
      <div style={{ width:7, height:7, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }}/>
      <span style={{ fontWeight:700, color:c }}>{name}</span>
      {cd != null && <span style={{ color:'var(--ink-mute)', fontFamily:'JetBrains Mono, monospace', fontSize:10 }}>CD{cd}</span>}
      {learning && <span style={{ color:'#ffd66b', fontFamily:'JetBrains Mono, monospace', fontSize:10 }}>수련 {learning}전</span>}
    </div>
  )
}
