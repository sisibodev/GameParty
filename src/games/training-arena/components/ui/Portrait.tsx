interface PortraitProps {
  label?: string
  height?: number
  width?: string | number
  tone?: number
  className?: string
  children?: React.ReactNode
}

const tones = [
  'linear-gradient(160deg,#3a2570,#1a1030)',
  'linear-gradient(160deg,#2a3570,#102038)',
  'linear-gradient(160deg,#70254a,#30142a)',
  'linear-gradient(160deg,#5a4a20,#2a2010)',
  'linear-gradient(160deg,#245a4a,#102a24)',
  'linear-gradient(160deg,#5a2a70,#251238)',
]

export default function Portrait({ label, height = 120, width = '100%', tone = 0, children }: PortraitProps) {
  return (
    <div className="arena-portrait" style={{ width, height, background:tones[tone % tones.length], position:'relative' }}>
      <div style={{ position:'absolute', inset:0, background:'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 8px, transparent 8px 16px)' }}/>
      {label && <div className="arena-mono" style={{ position:'absolute', left:8, bottom:8, fontSize:10, color:'var(--ink-mute)', letterSpacing:'.1em', textTransform:'uppercase' }}>{label}</div>}
      {children}
    </div>
  )
}
