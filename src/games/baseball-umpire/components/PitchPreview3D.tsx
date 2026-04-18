import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { PitchType, PitcherForm, PitchParams, BatterProfile } from '../types'
import { FullPitchConfig, MOUND_DISTANCE, BALL_RADIUS, buildPitchCurveWithConfig } from '../utils/pitch'

interface Props {
  pitchType: PitchType
  form: PitcherForm
  config: FullPitchConfig
  onClose: () => void
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

// 궤적 튜브 레이어 (리플레이와 동일)
const TRAIL_LAYERS = [
  { radius: 0.037, color: 0xffffff, opacity: 0.90 },
  { radius: 0.060, color: 0xe0e8ff, opacity: 0.35 },
  { radius: 0.095, color: 0x9999dd, opacity: 0.12 },
] as const

/** 현재 config + form 기준으로 프리뷰 PitchParams 생성 */
function buildPreviewPitch(
  pitchType: PitchType,
  form: PitcherForm,
  config: FullPitchConfig,
): PitchParams {
  const mv = config.pitchMovement[pitchType]
  const fm = config.formMult[form]

  const zoneCenter = (PREVIEW_BATTER.zoneBottom + PREVIEW_BATTER.zoneTop) / 2

  // 무브먼트: 기본값(중앙) + xBase*fm.x, yBase*fm.y (랜덤 없이 기준값만)
  const mvX = mv.xBase * fm.x
  const rawMvY = mv.yBase * fm.y
  const mvY = mv.forceDown ? Math.min(rawMvY, -0.05) : rawMvY

  let targetY = zoneCenter + mvY
  if (mv.forceDown) {
    const maxY = PREVIEW_BATTER.zoneBottom + (PREVIEW_BATTER.zoneTop - PREVIEW_BATTER.zoneBottom) * 0.6
    targetY = Math.min(zoneCenter + mvY, maxY)
  }

  const plateX = 0 + mvX
  const plateY = targetY

  const isStrike =
    Math.abs(plateX) <= PREVIEW_BATTER.zoneHalfWidth + BALL_RADIUS &&
    plateY >= PREVIEW_BATTER.zoneBottom - BALL_RADIUS &&
    plateY <= PREVIEW_BATTER.zoneTop + BALL_RADIUS

  return {
    pitchIndex: 0,
    pitchType,
    pitcherForm: form,
    speed: 140,
    plateX,
    plateY,
    isStrike,
    isBorderline: false,
    playerCall: null,
    correct: undefined,
    scoreChange: undefined,
    batter: PREVIEW_BATTER,
  }
}

/** 카메라 위치/시점 반환 */
function getCamSettings(view: CamView, midZ: number) {
  if (view === 'catcher') {
    return {
      pos: new THREE.Vector3(0, 1.3, -3.0),
      look: new THREE.Vector3(0, 1.0, midZ),
      fov: 40,
    }
  }
  if (view === 'side') {
    return {
      pos: new THREE.Vector3(-8, 2.2, midZ),
      look: new THREE.Vector3(0, 1.0, midZ),
      fov: 38,
    }
  }
  // top
  return {
    pos: new THREE.Vector3(0, 9, midZ * 0.5),
    look: new THREE.Vector3(0, 0, midZ * 0.5),
    fov: 45,
  }
}

const CAM_LABELS: Record<CamView, string> = {
  catcher: '📸 포수시점',
  side:    '📐 측면',
  top:     '🔭 위에서',
}

export default function PitchPreview3D({ pitchType, form, config, onClose }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null)
  const stateRef  = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    ball: THREE.Mesh
    trailGroup: THREE.Group
    curve: THREE.CubicBezierCurve3
    pitch: PitchParams
    animId?: number
    t: number
    speed: number  // 배속
    playing: boolean
    arrived: boolean
    zoneBox: THREE.Mesh
  } | null>(null)

  const [playing, setPlaying] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [camView, setCamView] = useState<CamView>('catcher')
  const [playSpeed, setPlaySpeed] = useState(0.5)
  const [pitchInfo, setPitchInfo] = useState<{ x: number; y: number; strike: boolean } | null>(null)

  // ── 씬 초기화 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const W = mount.clientWidth  || 640
    const H = mount.clientHeight || 360

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.setClearColor(0x08111e)
    mount.appendChild(renderer.domElement)

    // scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x08111e, 0.018)

    // camera
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 200)
    camera.position.set(0, 1.3, -3.0)
    camera.lookAt(0, 1.0, MOUND_DISTANCE * 0.5)

    // lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.0)
    sun.position.set(5, 10, 5)
    sun.castShadow = true
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x4488ff, 0.3)
    fill.position.set(-5, 3, -5)
    scene.add(fill)

    // ── 그라운드 ──
    const groundGeo = new THREE.PlaneGeometry(60, 60)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a3d0a })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // ── 마운드 ──
    const moundGeo = new THREE.CylinderGeometry(2.7, 3.0, 0.25, 32)
    const moundMat = new THREE.MeshLambertMaterial({ color: 0x8b6914 })
    const mound = new THREE.Mesh(moundGeo, moundMat)
    mound.position.set(0, 0.125, MOUND_DISTANCE)
    scene.add(mound)

    // 투수판 (흰색 직사각형)
    const rubberGeo = new THREE.BoxGeometry(0.61, 0.06, 0.15)
    const rubberMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
    const rubber = new THREE.Mesh(rubberGeo, rubberMat)
    rubber.position.set(0, 0.26, MOUND_DISTANCE - 0.3)
    scene.add(rubber)

    // ── 홈플레이트 오각형 ──
    const plateShape = new THREE.Shape()
    const pw = 0.2175, pd = 0.215
    plateShape.moveTo(-pw, 0)
    plateShape.lineTo(pw, 0)
    plateShape.lineTo(pw, pd)
    plateShape.lineTo(0, pd + pd * 0.5)
    plateShape.lineTo(-pw, pd)
    plateShape.closePath()
    const plateGeo = new THREE.ShapeGeometry(plateShape)
    const plateMat = new THREE.MeshLambertMaterial({ color: 0xfafafa, side: THREE.DoubleSide })
    const plate = new THREE.Mesh(plateGeo, plateMat)
    plate.rotation.x = -Math.PI / 2
    plate.position.set(0, 0.01, 0)
    scene.add(plate)

    // ── 스트라이크 존 와이어프레임 ──
    const b = PREVIEW_BATTER
    const zW = b.zoneHalfWidth * 2
    const zH = b.zoneTop - b.zoneBottom
    const zoneMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide,
    })
    const zoneGeo = new THREE.PlaneGeometry(zW, zH)
    const zoneBox = new THREE.Mesh(zoneGeo, zoneMat)
    zoneBox.position.set(0, b.zoneBottom + zH / 2, -0.30)
    scene.add(zoneBox)

    // 존 테두리
    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(zW, zH, 0.01))
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 })
    const zoneEdge = new THREE.LineSegments(edgesGeo, edgesMat)
    zoneEdge.position.copy(zoneBox.position)
    scene.add(zoneEdge)

    // ── 공 ──
    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 20, 20)
    const ballMat = new THREE.MeshLambertMaterial({ color: 0xf5f0dc })
    const ball = new THREE.Mesh(ballGeo, ballMat)
    ball.castShadow = true
    scene.add(ball)

    // ── 궤적 그룹 ──
    const trailGroup = new THREE.Group()
    trailGroup.visible = false
    scene.add(trailGroup)
    TRAIL_LAYERS.forEach(layer => {
      const m = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 1)]),
          1, layer.radius, 6, false,
        ),
        new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity }),
      )
      trailGroup.add(m)
    })

    // ── 커브 생성 ──
    const pitch = buildPreviewPitch(pitchType, form, config)
    const curve = buildPitchCurveWithConfig(pitch, form, config)

    // 공 초기 위치 = 릴리즈 포인트
    const startPt = curve.getPoint(0)
    ball.position.copy(startPt)

    const midZ = (startPt.z + (-0.30)) / 2

    stateRef.current = {
      renderer, scene, camera, ball,
      trailGroup, curve, pitch,
      t: 0, speed: 0.5, playing: false, arrived: false,
      zoneBox,
    }

    setPitchInfo({ x: pitch.plateX, y: pitch.plateY, strike: pitch.isStrike })

    // ── 렌더 루프 ──
    const flightMs = (MOUND_DISTANCE / (140 / 3.6)) * 1000

    let last = performance.now()
    function loop() {
      const st = stateRef.current!
      st.animId = requestAnimationFrame(loop)

      const now = performance.now()
      const dt  = Math.min(now - last, 50)
      last = now

      if (st.playing && !st.arrived) {
        st.t += (dt / flightMs) * st.speed
        if (st.t >= 1) {
          st.t = 1
          st.playing = false
          st.arrived = true
          setPlaying(false)
          setArrived(true)
        }

        const pos = st.curve.getPoint(st.t)
        st.ball.position.copy(pos)

        // 궤적 업데이트
        if (st.t > 0.01) {
          st.trailGroup.visible = true
          const nPts = Math.max(2, Math.round(st.t * 60) + 1)
          const pts: THREE.Vector3[] = []
          for (let i = 0; i < nPts; i++) {
            pts.push(st.curve.getPoint((i / (nPts - 1)) * st.t))
          }
          const tc = new THREE.CatmullRomCurve3(pts)
          st.trailGroup.children.forEach((child, idx) => {
            const mesh = child as THREE.Mesh
            mesh.geometry.dispose()
            mesh.geometry = new THREE.TubeGeometry(
              tc, Math.max(1, nPts - 1), TRAIL_LAYERS[idx].radius, 6, false,
            )
          })
        }
      }

      st.renderer.render(st.scene, st.camera)
    }
    loop()

    // ── 카메라 초기 적용 ──
    const cam = getCamSettings('catcher', midZ)
    camera.position.copy(cam.pos)
    camera.lookAt(cam.look)
    camera.fov = cam.fov
    camera.updateProjectionMatrix()

    // resize
    const ro = new ResizeObserver(() => {
      if (!mount || !stateRef.current) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      stateRef.current.renderer.setSize(w, h)
      stateRef.current.camera.aspect = w / h
      stateRef.current.camera.updateProjectionMatrix()
    })
    ro.observe(mount)

    return () => {
      ro.disconnect()
      if (stateRef.current?.animId) cancelAnimationFrame(stateRef.current.animId)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchType, form, config])  // config 변경 시 씬 재초기화

  // ── 카메라 뷰 변경 ───────────────────────────────────────────────────────────
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const startPt = st.curve.getPoint(0)
    const midZ = (startPt.z + (-0.30)) / 2
    const cam = getCamSettings(camView, midZ)
    st.camera.position.copy(cam.pos)
    st.camera.lookAt(cam.look)
    st.camera.fov = cam.fov
    st.camera.updateProjectionMatrix()
  }, [camView])

  // ── 배속 동기화 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stateRef.current) stateRef.current.speed = playSpeed
  }, [playSpeed])

  // ── 투구 실행 ────────────────────────────────────────────────────────────────
  const handleThrow = useCallback(() => {
    const st = stateRef.current
    if (!st) return

    // 처음부터 리셋
    st.t = 0
    st.playing = true
    st.arrived = false
    st.trailGroup.visible = false

    // 공을 시작 위치로
    const startPt = st.curve.getPoint(0)
    st.ball.position.copy(startPt)

    setPlaying(true)
    setArrived(false)
  }, [])

  // ── 결과 인디케이터 (공이 도착했을 때 존 위치 표시) ──
  const strikeColor = pitchInfo?.strike ? '#ff5722' : '#2196f3'

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* 헤더 */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            ▶ 궤적 미리보기 &nbsp;
            <span style={{ fontSize: 13, color: '#9ecaf8' }}>
              {FORM_LABELS[form]} / {PITCH_LABELS[pitchType]}
            </span>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 3D 캔버스 */}
        <div ref={mountRef} style={s.canvas} />

        {/* 컨트롤 바 */}
        <div style={s.controls}>
          {/* 투구 버튼 */}
          <button
            style={{ ...s.throwBtn, opacity: playing ? 0.5 : 1 }}
            onClick={handleThrow}
            disabled={playing}
          >
            ⚾ {arrived ? '다시 투구' : '투구!'}
          </button>

          {/* 배속 */}
          <div style={s.speedGroup}>
            <span style={s.ctrlLabel}>배속</span>
            {[0.25, 0.5, 1.0].map(sp => (
              <button
                key={sp}
                style={{ ...s.speedBtn, ...(playSpeed === sp ? s.speedBtnActive : {}) }}
                onClick={() => setPlaySpeed(sp)}
              >
                {sp}×
              </button>
            ))}
          </div>

          {/* 카메라 */}
          <div style={s.camGroup}>
            {(['catcher', 'side', 'top'] as CamView[]).map(v => (
              <button
                key={v}
                style={{ ...s.camBtn, ...(camView === v ? s.camBtnActive : {}) }}
                onClick={() => setCamView(v)}
              >
                {CAM_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* 결과 정보 */}
        {pitchInfo && (
          <div style={s.infoBar}>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>예상 위치</span>
              <span style={s.infoVal}>
                X: {pitchInfo.x >= 0 ? '+' : ''}{pitchInfo.x.toFixed(3)}m
                &nbsp;/&nbsp;
                Y: {pitchInfo.y.toFixed(3)}m
              </span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>판정</span>
              <span style={{ ...s.infoVal, color: strikeColor, fontWeight: 800 }}>
                {pitchInfo.strike ? '스트라이크' : '볼'}
              </span>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>존 기준</span>
              <span style={s.infoVal}>
                Y {PREVIEW_BATTER.zoneBottom.toFixed(2)}~{PREVIEW_BATTER.zoneTop.toFixed(2)}m
                &nbsp;/&nbsp;
                X ±{PREVIEW_BATTER.zoneHalfWidth.toFixed(3)}m
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const PITCH_LABELS: Record<PitchType, string> = {
  fastball: '직구', two_seam: '투심', sinker: '싱커', cutter: '커터',
  changeup: '체인지업', slider: '슬라이더', sweeper: '스위퍼',
  curve: '커브', splitter: '스플리터', forkball: '포크볼',
}
const FORM_LABELS: Record<PitcherForm, string> = {
  overhand: '오버핸드', three_quarter: '스리쿼터',
  sidearm: '사이드암', underhand: '언더핸드',
}
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#0a1525',
    border: '1px solid rgba(0,229,255,0.3)',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    width: '90vw',
    maxWidth: 800,
    boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.3)',
  },
  headerTitle: {
    fontSize: 15, fontWeight: 700, color: '#fff',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#aaa',
    fontSize: 18, cursor: 'pointer', padding: '2px 8px',
  },
  canvas: {
    width: '100%',
    height: 380,
    background: '#08111e',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 20px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.25)',
    flexWrap: 'wrap',
  },
  throwBtn: {
    background: 'rgba(255,87,34,0.25)',
    border: '1px solid #ff5722',
    color: '#ff8a65',
    padding: '8px 22px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 800,
    transition: 'all 0.15s',
  },
  speedGroup: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  ctrlLabel: {
    fontSize: 11, color: '#666', marginRight: 2,
  },
  speedBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#aaa',
    padding: '4px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 12,
  },
  speedBtnActive: {
    background: 'rgba(0,229,255,0.18)',
    border: '1px solid rgba(0,229,255,0.6)',
    color: '#00e5ff',
    fontWeight: 700,
  },
  camGroup: {
    display: 'flex', gap: 6, marginLeft: 'auto',
  },
  camBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: '#888',
    padding: '4px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
  },
  camBtnActive: {
    background: 'rgba(255,204,0,0.15)',
    border: '1px solid rgba(255,204,0,0.5)',
    color: '#ffcc00',
    fontWeight: 700,
  },
  infoBar: {
    display: 'flex',
    gap: 24,
    padding: '10px 20px',
    background: 'rgba(0,0,0,0.35)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    flexWrap: 'wrap',
  },
  infoItem: {
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  infoLabel: {
    fontSize: 10, color: '#555',
  },
  infoVal: {
    fontSize: 13, color: '#ccc', fontWeight: 600,
  },
}
