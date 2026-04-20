import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { PitchType, PitcherForm, PitchParams, BatterProfile } from '../types'
import { FullPitchConfig, MOUND_DISTANCE, BALL_RADIUS, buildPitchCurveWithConfig } from '../utils/pitch'

interface Props {
  pitchType: PitchType
  form: PitcherForm
  config: FullPitchConfig
  randomSeed?: number       // 변경 시 새 랜덤 착지점으로 재투구
  onRethrow?: () => void    // 부모에서 seed를 올려달라는 콜백 (선택)
}

// 프리뷰용 기본 타자 (평균 체형)
const PREVIEW_BATTER: BatterProfile = {
  index: 0,
  height: 'medium',
  build: 'normal',
  stance: 'mid',
  isLefty: false,
  zoneBottom: 0.56,
  zoneTop: 1.17,
  zoneHalfWidth: 0.32435,
}

type CamView = 'catcher' | 'side' | 'top'

const TRAIL_LAYERS = [
  { radius: 0.037, color: 0xffffff, opacity: 0.90 },
  { radius: 0.060, color: 0xe0e8ff, opacity: 0.35 },
  { radius: 0.095, color: 0x9999dd, opacity: 0.12 },
] as const

const PITCH_LABELS: Record<PitchType, string> = {
  fastball: '직구', two_seam: '투심', sinker: '싱커', cutter: '커터',
  changeup: '체인지업', slider: '슬라이더', sweeper: '스위퍼',
  curve: '커브', splitter: '스플리터', forkball: '포크볼',
}
const FORM_LABELS: Record<PitcherForm, string> = {
  overhand: '오버핸드', three_quarter: '스리쿼터',
  sidearm: '사이드암', underhand: '언더핸드',
}
const CAM_LABELS: Record<CamView, string> = {
  catcher: '📸 포수', side: '📐 측면', top: '🔭 위',
}

/** seed 기반 결정론적 난수 (0~1) — slot은 서로 다른 값을 얻기 위한 인덱스 */
function seededFloat(seed: number, slot: number): number {
  return Math.abs(Math.sin(seed * 127.1 + slot * 311.7)) % 1
}

function buildPreviewPitch(
  pitchType: PitchType,
  form: PitcherForm,
  config: FullPitchConfig,
  seed = 0,
): PitchParams {
  const mv = config.pitchMovement[pitchType]
  const fm = config.formMult[form]
  const zoneCenter = (PREVIEW_BATTER.zoneBottom + PREVIEW_BATTER.zoneTop) / 2

  // seed 기반 xRange / yRange 랜덤 적용 (seed=0이면 기준값 그대로)
  const randX = seed === 0 ? 0 : (seededFloat(seed, 0) * 2 - 1) * mv.xRange
  const randY = seed === 0 ? 0 : (seededFloat(seed, 1) * 2 - 1) * mv.yRange

  const mvX = (mv.xBase + randX) * fm.x
  const rawMvY = (mv.yBase + randY) * fm.y
  const mvY = mv.forceDown ? Math.min(rawMvY, -0.05) : rawMvY

  let targetY = zoneCenter + mvY
  if (mv.forceDown) {
    const maxY = PREVIEW_BATTER.zoneBottom + (PREVIEW_BATTER.zoneTop - PREVIEW_BATTER.zoneBottom) * 0.6
    targetY = Math.min(zoneCenter + mvY, maxY)
  }

  const plateX = mvX
  const plateY = targetY
  const isStrike =
    Math.abs(plateX) <= PREVIEW_BATTER.zoneHalfWidth + BALL_RADIUS &&
    plateY >= PREVIEW_BATTER.zoneBottom - BALL_RADIUS &&
    plateY <= PREVIEW_BATTER.zoneTop + BALL_RADIUS

  return {
    pitchIndex: 0, pitchType, pitcherForm: form,
    speed: 140, plateX, plateY, isStrike,
    isBorderline: false, playerCall: null,
    correct: undefined, scoreChange: undefined,
    batter: PREVIEW_BATTER,
  }
}

function getCamSettings(view: CamView, midZ: number) {
  if (view === 'catcher') return { pos: new THREE.Vector3(0, 1.3, -3.0), look: new THREE.Vector3(0, 1.0, midZ), fov: 40 }
  if (view === 'side')    return { pos: new THREE.Vector3(-8, 2.2, midZ), look: new THREE.Vector3(0, 1.0, midZ), fov: 38 }
  return                         { pos: new THREE.Vector3(0, 9, midZ * 0.5), look: new THREE.Vector3(0, 0, midZ * 0.5), fov: 45 }
}

// ── 씬 레벨 객체들 (전체 마운트 한 번만 초기화) ────────────────────────────
interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  ball: THREE.Mesh
  trailGroup: THREE.Group
  curve: THREE.CubicBezierCurve3
  pitch: PitchParams
  animId?: number
  t: number
  speed: number
  playing: boolean
  arrived: boolean
  midZ: number
}

export default function PitchPreview3D({ pitchType, form, config, randomSeed = 0, onRethrow }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<SceneState | null>(null)
  const prevRandomSeedRef = useRef<number | undefined>(undefined)

  const [playing, setPlaying] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [camView, setCamView] = useState<CamView>('catcher')
  const [playSpeed, setPlaySpeed] = useState(0.5)
  const [pitchInfo, setPitchInfo] = useState<{ x: number; y: number; strike: boolean } | null>(null)

  // ── ① 씬 전체 초기화 (마운트 1회만) ────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const W = mount.clientWidth  || 500
    const H = mount.clientHeight || 340

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x08111e)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x08111e, 0.016)

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200)

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.65))
    const sun = new THREE.DirectionalLight(0xffffff, 1.0)
    sun.position.set(5, 10, 5)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x4488ff, 0.3)
    fill.position.set(-5, 3, -5)
    scene.add(fill)

    // 잔디
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshLambertMaterial({ color: 0x1a3d0a }),
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    // 마운드
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 3.0, 0.25, 32),
      new THREE.MeshLambertMaterial({ color: 0x8b6914 }),
    )
    mound.position.set(0, 0.125, MOUND_DISTANCE)
    scene.add(mound)

    // 투수판
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(0.61, 0.06, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    )
    rubber.position.set(0, 0.27, MOUND_DISTANCE - 0.3)
    scene.add(rubber)

    // 홈플레이트
    const plateShape = new THREE.Shape()
    const pw = 0.2175, pd = 0.215
    plateShape.moveTo(-pw, 0); plateShape.lineTo(pw, 0)
    plateShape.lineTo(pw, pd); plateShape.lineTo(0, pd + pd * 0.5)
    plateShape.lineTo(-pw, pd); plateShape.closePath()
    const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshLambertMaterial({ color: 0xfafafa, side: THREE.DoubleSide }))
    plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.01, 0)
    scene.add(plate)

    // 스트라이크 존
    const b = PREVIEW_BATTER
    const zW = b.zoneHalfWidth * 2, zH = b.zoneTop - b.zoneBottom
    const zonePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(zW, zH),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    )
    zonePlane.position.set(0, b.zoneBottom + zH / 2, -0.30)
    scene.add(zonePlane)
    const zoneEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(zW, zH, 0.01)),
      new THREE.LineBasicMaterial({ color: 0x00e5ff }),
    )
    zoneEdge.position.copy(zonePlane.position)
    scene.add(zoneEdge)

    // 공
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 20, 20),
      new THREE.MeshLambertMaterial({ color: 0xf5f0dc }),
    )
    scene.add(ball)

    // 궤적 그룹
    const trailGroup = new THREE.Group()
    trailGroup.visible = false
    scene.add(trailGroup)
    TRAIL_LAYERS.forEach(layer => {
      trailGroup.add(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 1)]), 1, layer.radius, 6, false),
        new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity }),
      ))
    })

    // 초기 커브
    const pitch = buildPreviewPitch(pitchType, form, config, randomSeed)
    const curve = buildPitchCurveWithConfig(pitch, form, config)
    const startPt = curve.getPoint(0)
    ball.position.copy(startPt)
    const midZ = (startPt.z + (-0.30)) / 2

    stateRef.current = {
      renderer, scene, camera, ball, trailGroup,
      curve, pitch, t: 0, speed: playSpeed,
      playing: false, arrived: false, midZ,
    }

    setPitchInfo({ x: pitch.plateX, y: pitch.plateY, strike: pitch.isStrike })

    // 카메라 초기 위치
    const cam = getCamSettings('catcher', midZ)
    camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.fov = cam.fov; camera.updateProjectionMatrix()

    // 렌더 루프
    const flightMs = (MOUND_DISTANCE / (140 / 3.6)) * 1000
    let last = performance.now()
    function loop() {
      const st = stateRef.current!
      st.animId = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = Math.min(now - last, 50); last = now

      if (st.playing && !st.arrived) {
        st.t += (dt / flightMs) * st.speed
        if (st.t >= 1) {
          st.t = 1; st.playing = false; st.arrived = true
          setPlaying(false); setArrived(true)
        }
        st.ball.position.copy(st.curve.getPoint(st.t))

        if (st.t > 0.01) {
          st.trailGroup.visible = true
          const nPts = Math.max(2, Math.round(st.t * 60) + 1)
          const pts: THREE.Vector3[] = []
          for (let i = 0; i < nPts; i++) pts.push(st.curve.getPoint((i / (nPts - 1)) * st.t))
          const tc = new THREE.CatmullRomCurve3(pts)
          st.trailGroup.children.forEach((child, idx) => {
            const mesh = child as THREE.Mesh
            mesh.geometry.dispose()
            mesh.geometry = new THREE.TubeGeometry(tc, Math.max(1, nPts - 1), TRAIL_LAYERS[idx].radius, 6, false)
          })
        }
      }
      st.renderer.render(st.scene, st.camera)
    }
    loop()

    // resize
    const ro = new ResizeObserver(() => {
      const st = stateRef.current; if (!st || !mount) return
      const w = mount.clientWidth, h = mount.clientHeight
      st.renderer.setSize(w, h); st.camera.aspect = w / h; st.camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    return () => {
      ro.disconnect()
      if (stateRef.current?.animId) cancelAnimationFrame(stateRef.current.animId)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      stateRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // 마운트 1회만

  // ── ② 커브만 업데이트 (pitchType/form/config/randomSeed 변경 시) ─────────
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const pitch = buildPreviewPitch(pitchType, form, config, randomSeed)
    const curve = buildPitchCurveWithConfig(pitch, form, config)
    st.curve = curve; st.pitch = pitch
    st.t = 0; st.arrived = false
    st.trailGroup.visible = false
    st.ball.position.copy(curve.getPoint(0))
    setPitchInfo({ x: pitch.plateX, y: pitch.plateY, strike: pitch.isStrike })
    setArrived(false)

    // randomSeed가 실제로 변경된 경우 → 자동 투구 시작 (랜덤 투구 버튼 클릭 시)
    const seedChanged = prevRandomSeedRef.current !== undefined
      && prevRandomSeedRef.current !== randomSeed
    prevRandomSeedRef.current = randomSeed

    if (seedChanged) {
      st.playing = true
      setPlaying(true)
    } else {
      st.playing = false
      setPlaying(false)
    }
  }, [pitchType, form, config, randomSeed])

  // ── 카메라 전환 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const st = stateRef.current; if (!st) return
    const cam = getCamSettings(camView, st.midZ)
    st.camera.position.copy(cam.pos); st.camera.lookAt(cam.look)
    st.camera.fov = cam.fov; st.camera.updateProjectionMatrix()
  }, [camView])

  // ── 배속 동기화 ──────────────────────────────────────────────────────────────
  useEffect(() => { if (stateRef.current) stateRef.current.speed = playSpeed }, [playSpeed])

  // ── 투구 ─────────────────────────────────────────────────────────────────────
  const handleThrow = useCallback(() => {
    const st = stateRef.current; if (!st) return
    st.t = 0; st.playing = true; st.arrived = false
    st.trailGroup.visible = false
    st.ball.position.copy(st.curve.getPoint(0))
    setPlaying(true); setArrived(false)
  }, [])

  const strikeColor = pitchInfo?.strike ? '#ff5722' : '#2196f3'

  return (
    <div style={s.panel}>
      {/* 타이틀 */}
      <div style={s.panelTitle}>
        <span style={s.titleForm}>{FORM_LABELS[form]}</span>
        <span style={s.titleSlash}>/</span>
        <span style={s.titlePitch}>{PITCH_LABELS[pitchType]}</span>
        <span style={s.titleSub}>궤적 미리보기</span>
      </div>

      {/* 3D 캔버스 */}
      <div ref={mountRef} style={s.canvas} />

      {/* 결과 정보 바 */}
      {pitchInfo && (
        <div style={s.infoBar}>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>도달 X</span>
            <span style={s.infoVal}>{pitchInfo.x >= 0 ? '+' : ''}{pitchInfo.x.toFixed(3)}m</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>도달 Y</span>
            <span style={s.infoVal}>{pitchInfo.y.toFixed(3)}m</span>
          </div>
          <div style={s.infoItem}>
            <span style={s.infoLabel}>판정</span>
            <span style={{ ...s.infoVal, color: strikeColor, fontWeight: 800 }}>
              {pitchInfo.strike ? '스트라이크' : '볼'}
            </span>
          </div>
          <div style={{ ...s.infoItem, marginLeft: 'auto' }}>
            <span style={s.infoLabel}>존 Y 범위</span>
            <span style={s.infoVal}>{PREVIEW_BATTER.zoneBottom.toFixed(2)}~{PREVIEW_BATTER.zoneTop.toFixed(2)}m</span>
          </div>
        </div>
      )}

      {/* 컨트롤 */}
      <div style={s.controls}>
        <button
          style={{ ...s.throwBtn, opacity: playing ? 0.5 : 1 }}
          onClick={handleThrow}
          disabled={playing}
        >
          ⚾ {arrived ? '다시 투구' : '투구!'}
        </button>
        {onRethrow && (
          <button
            style={{ ...s.throwBtn, background: 'rgba(255,152,0,0.2)', borderColor: 'rgba(255,152,0,0.5)', color: '#ffcc80', fontSize: 12, padding: '5px 12px' }}
            onClick={() => { onRethrow(); }}
            title="랜덤 착지점으로 새 투구"
          >
            🔀 랜덤 투구
          </button>
        )}

        <div style={s.group}>
          {[0.25, 0.5, 1.0].map(sp => (
            <button key={sp}
              style={{ ...s.smallBtn, ...(playSpeed === sp ? s.smallBtnOn : {}) }}
              onClick={() => setPlaySpeed(sp)}
            >
              {sp}×
            </button>
          ))}
        </div>

        <div style={{ ...s.group, marginLeft: 'auto' }}>
          {(['catcher', 'side', 'top'] as CamView[]).map(v => (
            <button key={v}
              style={{ ...s.smallBtn, ...(camView === v ? s.camBtnOn : {}) }}
              onClick={() => setCamView(v)}
            >
              {CAM_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex', flexDirection: 'column',
    flex: 1, minWidth: 0,
    background: 'rgba(0,0,0,0.25)',
    borderLeft: '1px solid rgba(255,255,255,0.07)',
  },
  panelTitle: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    padding: '10px 16px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.2)',
    flexShrink: 0,
  },
  titleForm:  { fontSize: 13, color: '#9ecaf8', fontWeight: 700 },
  titleSlash: { fontSize: 11, color: '#444' },
  titlePitch: { fontSize: 13, color: '#fff', fontWeight: 700 },
  titleSub:   { fontSize: 10, color: '#555', marginLeft: 6 },
  canvas: {
    flex: 1, minHeight: 0,
    background: '#08111e',
  },
  infoBar: {
    display: 'flex', gap: 16, flexWrap: 'wrap',
    padding: '7px 14px',
    background: 'rgba(0,0,0,0.3)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  infoItem:  { display: 'flex', flexDirection: 'column', gap: 1 },
  infoLabel: { fontSize: 9, color: '#555' },
  infoVal:   { fontSize: 12, color: '#ccc', fontWeight: 600 },
  controls: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(0,0,0,0.2)',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  throwBtn: {
    background: 'rgba(255,87,34,0.25)',
    border: '1px solid #ff5722',
    color: '#ff8a65',
    padding: '7px 20px',
    borderRadius: 7,
    cursor: 'pointer',
    fontSize: 14, fontWeight: 800,
  },
  group: { display: 'flex', gap: 4 },
  smallBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#888',
    padding: '4px 9px',
    borderRadius: 5, cursor: 'pointer', fontSize: 11,
  },
  smallBtnOn: {
    background: 'rgba(0,229,255,0.15)',
    border: '1px solid rgba(0,229,255,0.55)',
    color: '#00e5ff', fontWeight: 700,
  },
  camBtnOn: {
    background: 'rgba(255,204,0,0.15)',
    border: '1px solid rgba(255,204,0,0.5)',
    color: '#ffcc00', fontWeight: 700,
  },
}
