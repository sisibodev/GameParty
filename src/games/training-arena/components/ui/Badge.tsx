interface BadgeProps {
  children: React.ReactNode
  tone?: 'violet' | 'gold' | 'red' | 'green' | 'cyan' | 'mute'
}

const tones = {
  violet: { bg:'rgba(164,120,255,.12)', bd:'rgba(164,120,255,.5)', c:'#c8a8ff' },
  gold:   { bg:'rgba(255,214,107,.12)', bd:'rgba(255,214,107,.5)', c:'#ffd66b' },
  red:    { bg:'rgba(255,92,110,.12)',  bd:'rgba(255,92,110,.5)',  c:'#ff7b89' },
  green:  { bg:'rgba(94,240,168,.12)', bd:'rgba(94,240,168,.5)',  c:'#5ef0a8' },
  cyan:   { bg:'rgba(103,232,249,.12)',bd:'rgba(103,232,249,.5)', c:'#67e8f9' },
  mute:   { bg:'rgba(255,255,255,.05)',bd:'var(--line)',           c:'var(--ink-dim)' },
}

export default function Badge({ children, tone = 'violet' }: BadgeProps) {
  const t = tones[tone]
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 9px', borderRadius:999, background:t.bg, border:`1px solid ${t.bd}`, color:t.c, fontSize:11, fontWeight:700, fontFamily:'JetBrains Mono, monospace', letterSpacing:'.02em' }}>
      {children}
    </span>
  )
}
