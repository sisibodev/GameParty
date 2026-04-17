import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PitchParams, PitchPhase, BatterProfile, PitcherForm, TrajectoryMode } from '../types'
import { buildPitchCurve, buildPhysicsCurve, speedToFlightMs, MOUND_DISTANCE } from '../utils/pitch'

const BATTER_ANIM_PATH  = `${import.meta.env.BASE_URL}games/baseball-umpire/animations/Idle.glb`
const PITCHER_ANIM_PATH = `${import.meta.env.BASE_URL}games/baseball-umpire/animations/Pitching.glb`

// 체형별 scale 배율
const HEIGHT_SCALE: Record<string, number> = { short: 0.92, medium: 1.0, tall: 1.07 }
const BUILD_SCALE:  Record<string, number> = { slim:  0.92, normal: 1.0, stocky: 1.08 }

function applyBatterProfile(model: THREE.Group, profile: BatterProfile) {
  const sy  = HEIGHT_SCALE[profile.height]  ?? 1.0
  const sxz = BUILD_SCALE[profile.build]    ?? 1.0
  const sx  = profile.isLefty ? -sxz : sxz
  const xPos = profile.isLefty ? -0.82 : 0.82
  model.scale.set(sx, sy, sxz)
  model.position.set(xPos, 0, 0.15)
  // model.visible = false 유지 (캐릭터 숨김)
}

// 카메라 포지션 상수 (3단계 리플레이)
const CAM_S1 = { pos: new THREE.Vector3(0, 1.5, -3.0),   look: new THREE.Vector3(0, 0.7, MOUND_DISTANCE * 0.35) }
const CAM_S2 = { pos: new THREE.Vector3(3.8, 1.8, -2.0), look: new THREE.Vector3(0, 0.8, 0.3) }
const CAM_S3 = { pos: new THREE.Vector3(5.5, 1.2, 0),    look: new THREE.Vector3(0, 0.75, 0) }

// 리플레이 ABS 면 Z 위치
const PLANE_Z = { front: 0.13, mid: 0, end: -0.13 }
const STAGE_HOLD_MS = 2600   // 각 단계 유지 시간
const CAM_LERP_DUR  = 1000   // 카메라 전환 시간(ms)

// 2단계 Q/E 궤도 카메라 초기 각도/반경 (CAM_S2 위치 기준)
const CAM_S2_ORBIT_ANGLE  = Math.atan2(CAM_S2.pos.x, -CAM_S2.pos.z)  // ≈ 1.09 rad
const CAM_S2_ORBIT_RADIUS = Math.sqrt(CAM_S2.pos.x ** 2 + CAM_S2.pos.z ** 2)  // ≈ 4.29 m

// 리플레이 궤적 튜브 레이어 정의 (공 반지름 = 0.037m 기준)
const TRAIL_LAYERS = [
  { radius: 0.037, color: 0xffffff, opacity: 0.85, side: THREE.FrontSide },
  { radius: 0.060, color: 0xe8e8ff, opacity: 0.30, side: THREE.FrontSide },
  { radius: 0.095, color: 0xaaaadd, opacity: 0.10, side: THREE.DoubleSide },
] as const

interface Props {
  batter: BatterProfile | null
  currentPitch: PitchParams | null
  pitchPhase: PitchPhase
  showZone: boolean
  trajectoryMode?: TrajectoryMode           // 'bezier' | 'physics' (기본: 'bezier')
  onPitchArrived: () => void
  onSceneReady: () => void
  // 리플레이
  replayPitch?: PitchParams | null
  replaySpeed?: number                      // 0.25 / 0.5 / 1.0
  replayStageOverride?: number              // 1/2/3: 수동 단계 이동
  onReplayEnd?: () => void
  onReplayStageChange?: (stage: number) => void
}

export default function BaseballScene({
  batter,
  currentPitch,
  pitchPhase,
  showZone,
  trajectoryMode = 'bezier',
  onPitchArrived,
  onSceneReady,
  replayPitch = null,
  replaySpeed = 1,
  replayStageOverride,
  onReplayEnd,
  onReplayStageChange,
}: Props) {
  const mountRef     = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const ballRef      = useRef<THREE.Mesh | null>(null)
  const zoneBoxRef   = useRef<THREE.Mesh | null>(null)
  const trailRef     = useRef<THREE.Line | null>(null)
  const replayTrailRef   = useRef<THREE.Group | null>(null)
  const replayMarkerRef  = useRef<THREE.Group | null>(null)  // 3면 마커 그룹
  const replayDropLineRef = useRef<THREE.Line | null>(null)
  const replayPlaneGroupRef = useRef<THREE.Group | null>(null)
  const animFrameRef    = useRef<number>(0)
  const flightTrailRef  = useRef<THREE.Line | null>(null)   // 비행 중 실시간 잔상
  const ballShadowRef   = useRef<THREE.Mesh | null>(null)   // 공 블롭 그림자
  const clockRef         = useRef(new THREE.Timer())
  const batterModelRef   = useRef<THREE.Group | null>(null)
  const pitcherModelRef  = useRef<THREE.Group | null>(null)
  const batterMixerRef   = useRef<THREE.AnimationMixer | null>(null)
  const pitcherMixerRef  = useRef<THREE.AnimationMixer | null>(null)
  const pitcherActionRef      = useRef<THREE.AnimationAction | null>(null)
  const pitcherClipsRef       = useRef<THREE.AnimationClip[]>([])   // 폼별 클립 목록
  const pitchReleaseTimeRef   = useRef<number>(2.0)  // frame 60의 실제 시간(초)
  // GLB 로드 콜백에서 최신 batter 접근용
  const currentBatterRef = useRef<BatterProfile | null>(null)

  // 궤적 방식 ref (stale closure 방지 — useEffect 의존성 없이 항상 최신값)
  const trajectoryModeRef = useRef<TrajectoryMode>(trajectoryMode)
  useEffect(() => { trajectoryModeRef.current = trajectoryMode }, [trajectoryMode])

  // 콜백 ref (stale closure 방지)
  const onPitchArrivedRef      = useRef(onPitchArrived)
  const onSceneReadyRef        = useRef(onSceneReady)
  const onReplayEndRef         = useRef(onReplayEnd)
  const onReplayStageChangeRef = useRef(onReplayStageChange)

  const pitchAnimRef = useRef<{
    curve: THREE.Curve<THREE.Vector3>
    startTime: number
    duration: number
  } | null>(null)
  const replayAnimRef = useRef<{
    curve: THREE.Curve<THREE.Vector3>
    startTime: number
    duration: number
    done: boolean
  } | null>(null)
  const arrivedRef = useRef(false)
  const replayBallRef = useRef<THREE.Mesh | null>(null)

  // 리플레이 단계 관리
  const replayStageRef = useRef(1)
  const cameraTransRef = useRef<{
    startTime: number
    duration: number
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromLook: THREE.Vector3
    toLook: THREE.Vector3
  } | null>(null)
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 단계 진행 함수 (render loop에서 호출, stale closure 방지를 위한 ref 패턴)
  const advanceToStage2Ref = useRef<(() => void) | null>(null)

  // Q/E 궤도 카메라 (2단계)
  const replayOrbitAngleRef  = useRef(CAM_S2_ORBIT_ANGLE)
  const replayOrbitRadiusRef = useRef(CAM_S2_ORBIT_RADIUS)

  // 콜백 ref 최신화
  useEffect(() => { onPitchArrivedRef.current      = onPitchArrived      }, [onPitchArrived])
  useEffect(() => { onSceneReadyRef.current        = onSceneReady        }, [onSceneReady])
  useEffect(() => { onReplayEndRef.current         = onReplayEnd         }, [onReplayEnd])
  useEffect(() => { onReplayStageChangeRef.current = onReplayStageChange }, [onReplayStageChange])

  // ── 씬 초기화 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const w = mount.clientWidth
    const h = mount.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.shadowMap.enabled = true
    renderer.setPixelRatio(window.devicePixelRatio)
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)  // 낮 하늘
    sceneRef.current = scene

    // Camera — 홈플레이트가 화면 하단에 잘 보이도록 뒤로 물림
    const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 500)
    camera.position.set(0, 1.5, -3.0)
    camera.lookAt(0, 0.7, MOUND_DISTANCE * 0.35)
    cameraRef.current = camera

    // ── 조명 ───────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(5, 20, 10)
    sun.castShadow = true
    scene.add(sun)

    // ── 그라운드 ────────────────────────────────────────────────────────────
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 120),
      new THREE.MeshLambertMaterial({ color: 0x4a7c3f })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, 0, MOUND_DISTANCE / 2)
    ground.receiveShadow = true
    scene.add(ground)

    // 내야 흙
    const infield = new THREE.Mesh(
      new THREE.CircleGeometry(28, 64),
      new THREE.MeshLambertMaterial({ color: 0xc4a265 })
    )
    infield.rotation.x = -Math.PI / 2
    infield.position.set(0, 0.01, MOUND_DISTANCE / 2)
    scene.add(infield)

    // ── 홈플레이트 ──────────────────────────────────────────────────────────
    buildHomePlate(scene)

    // ── 마운드 ──────────────────────────────────────────────────────────────
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 3.0, 0.25, 32),
      new THREE.MeshLambertMaterial({ color: 0xc4a265 })
    )
    mound.position.set(0, 0.12, MOUND_DISTANCE)
    scene.add(mound)

    // ── 투수판 ──────────────────────────────────────────────────────────────
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.05, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    )
    rubber.position.set(0, 0.28, MOUND_DISTANCE)
    scene.add(rubber)

    // ── 공 ──────────────────────────────────────────────────────────────────
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 16, 16),
      new THREE.MeshLambertMaterial({
        color: 0xfffde7,         // 크림 화이트 — 하늘 배경(0x87ceeb)과 대비
        emissive: 0xfff9c4,      // 약한 자체 발광
        emissiveIntensity: 0.35,
      })
    )
    ball.visible = false
    ball.castShadow = true
    scene.add(ball)
    ballRef.current = ball

    // ── 리플레이 공 (노란색) ─────────────────────────────────────────────────
    const replayBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xffee00, emissive: 0xffcc00, emissiveIntensity: 0.3 })
    )
    replayBall.visible = false
    scene.add(replayBall)
    replayBallRef.current = replayBall

    // ── 스트라이크존 박스 (기본; batter 변경 시 업데이트) ────────────────────
    const zoneBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.43, 0.5, 0.02),
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
    zoneBox.position.set(0, 0.8, 0.01)
    zoneBox.visible = false
    scene.add(zoneBox)
    zoneBoxRef.current = zoneBox

    // 존 테두리
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(zoneBox.geometry),
      new THREE.LineBasicMaterial({ color: 0x00ffff })
    )
    zoneBox.add(edges)

    // ── 공 블롭 그림자 ───────────────────────────────────────────────────────
    const ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    )
    ballShadow.rotation.x = -Math.PI / 2
    ballShadow.position.y = 0.016   // 지면 바로 위 (z-fighting 방지)
    ballShadow.visible = false
    scene.add(ballShadow)
    ballShadowRef.current = ballShadow

    // ── 비행 중 실시간 잔상 라인 ─────────────────────────────────────────────
    const TRAIL_LEN = 12
    const trailPositions = new Float32Array(TRAIL_LEN * 3)
    const flightTrailGeo = new THREE.BufferGeometry()
    flightTrailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
    flightTrailGeo.setDrawRange(0, TRAIL_LEN)
    const flightTrailLine = new THREE.Line(
      flightTrailGeo,
      new THREE.LineBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.65 })
    )
    flightTrailLine.visible = false
    scene.add(flightTrailLine)
    flightTrailRef.current = flightTrailLine

    // ── 외야 스탠드 ──────────────────────────────────────────────────────────
    buildStands(scene)

    // ── GLB 로드 (StrictMode 이중 마운트 방지용 cancelled 플래그) ─────────────
    const loader = new GLTFLoader()
    let glbCancelled = false

    loader.load(PITCHER_ANIM_PATH, (gltf) => {
      if (glbCancelled || !sceneRef.current) return
      const model = gltf.scene
      model.position.set(0, 0, MOUND_DISTANCE)
      model.rotation.y = Math.PI
      model.visible = false
      sceneRef.current.add(model)
      pitcherModelRef.current = model

      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model)
        pitcherClipsRef.current = gltf.animations

        // 기본 클립: overhand (없으면 첫 번째)
        const defaultClip = THREE.AnimationClip.findByName(gltf.animations, 'overhand')
          ?? gltf.animations[0]

        // frame 60의 실제 시간(초) 계산 — FPS를 첫 두 키프레임 간격으로 추정
        const RELEASE_FRAME = 60
        const track = defaultClip.tracks[0]
        if (track && track.times.length >= 2) {
          const fps = Math.round(1 / (track.times[1] - track.times[0]))
          pitchReleaseTimeRef.current = RELEASE_FRAME / fps
        }

        const action = mixer.clipAction(defaultClip)
        action.loop              = THREE.LoopOnce
        action.clampWhenFinished = true
        action.play()
        pitcherActionRef.current = action
        pitcherMixerRef.current  = mixer
      }
    })

    loader.load(BATTER_ANIM_PATH, (gltf) => {
      if (glbCancelled || !sceneRef.current) return
      const model = gltf.scene
      model.visible = false
      sceneRef.current.add(model)
      batterModelRef.current = model

      if (currentBatterRef.current) {
        applyBatterProfile(model, currentBatterRef.current)
      }

      if (gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model)
        mixer.clipAction(gltf.animations[0]).play()
        batterMixerRef.current = mixer
      }
    })

    // ── 리사이즈 핸들러 ─────────────────────────────────────────────────────
    const onResize = () => {
      const w2 = mount.clientWidth
      const h2 = mount.clientHeight
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
    }
    window.addEventListener('resize', onResize)

    // ── 렌더 루프 ────────────────────────────────────────────────────────────
    const lookAtWork = new THREE.Vector3()
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      const now   = performance.now()
      clockRef.current.update()
      const delta = clockRef.current.getDelta()

      // 캐릭터 애니메이션 믹서 업데이트
      if (batterMixerRef.current)  batterMixerRef.current.update(delta)
      if (pitcherMixerRef.current) pitcherMixerRef.current.update(delta)

      // 투구 애니메이션
      if (pitchAnimRef.current && ballRef.current) {
        const { curve, startTime, duration } = pitchAnimRef.current
        const t = Math.min((now - startTime) / duration, 1)
        ballRef.current.position.copy(curve.getPoint(t))

        // 비행 중 실시간 잔상 업데이트
        if (flightTrailRef.current) {
          const posAttr = flightTrailRef.current.geometry.attributes.position as THREE.BufferAttribute
          const TLEN = posAttr.count
          // 이전 점들을 뒤로 shift
          for (let i = TLEN - 1; i > 0; i--) {
            posAttr.setXYZ(i, posAttr.getX(i - 1), posAttr.getY(i - 1), posAttr.getZ(i - 1))
          }
          // 0번에 현재 공 위치 삽입
          const bp = ballRef.current.position
          posAttr.setXYZ(0, bp.x, bp.y, bp.z)
          posAttr.needsUpdate = true
        }

        if (t >= 1 && !arrivedRef.current) {
          arrivedRef.current = true
          pitchAnimRef.current = null
          onPitchArrivedRef.current()
        }
      }

      // 공 블롭 그림자 업데이트 (비행 중 공 or 리플레이 공)
      if (ballShadowRef.current) {
        const activeBall = ballRef.current?.visible
          ? ballRef.current
          : replayBallRef.current?.visible
            ? replayBallRef.current
            : null
        if (activeBall) {
          const bp = activeBall.position
          const h  = Math.max(0, bp.y)                        // 지면 기준 높이
          const scale   = Math.max(0.2, 1.1 - h * 0.38)      // 높을수록 작아짐
          const opacity = Math.max(0.04, 0.42 - h * 0.10)    // 높을수록 투명
          ballShadowRef.current.visible = true
          ballShadowRef.current.position.set(bp.x, 0.016, bp.z)
          ballShadowRef.current.scale.setScalar(scale)
          ;(ballShadowRef.current.material as THREE.MeshBasicMaterial).opacity = opacity
        } else {
          ballShadowRef.current.visible = false
        }
      }

      // 리플레이 1단계: 공 애니메이션 + 궤적 리본 실시간 갱신
      if (replayAnimRef.current && replayBallRef.current && !replayAnimRef.current.done) {
        const { curve, startTime, duration } = replayAnimRef.current
        const t = Math.min((now - startTime) / duration, 1)
        replayBallRef.current.position.copy(curve.getPoint(t))

        // 궤적: 공이 지나간 부분(0→t)만 튜브로 그리기
        // ※ curve.getPoints(n)은 전체(0→1)를 샘플링하므로,
        //   직접 getPoint(u * t)로 0→t 구간만 샘플링해야 함
        if (replayTrailRef.current && t > 0.01) {
          replayTrailRef.current.visible = true
          const nShown = Math.max(2, Math.round(t * 60) + 1)
          const pts: THREE.Vector3[] = []
          for (let i = 0; i < nShown; i++) {
            pts.push(curve.getPoint((i / (nShown - 1)) * t))
          }
          const tc = new THREE.CatmullRomCurve3(pts)
          replayTrailRef.current.children.forEach((child, i) => {
            const mesh = child as THREE.Mesh
            mesh.geometry.dispose()
            mesh.geometry = new THREE.TubeGeometry(tc, Math.max(1, nShown - 1), TRAIL_LAYERS[i].radius, 8, false)
          })
        }

        if (t >= 1) {
          replayAnimRef.current.done = true
          // 공 도착 시 전체 궤적(0→1)으로 최종 확정
          if (replayTrailRef.current) {
            const nFull = 60
            const pts: THREE.Vector3[] = []
            for (let i = 0; i <= nFull; i++) pts.push(curve.getPoint(i / nFull))
            const tc = new THREE.CatmullRomCurve3(pts)
            replayTrailRef.current.visible = true
            replayTrailRef.current.children.forEach((child, i) => {
              const mesh = child as THREE.Mesh
              mesh.geometry.dispose()
              mesh.geometry = new THREE.TubeGeometry(tc, nFull, TRAIL_LAYERS[i].radius, 8, false)
            })
          }
          // 단계 1 완료 → 단계 2로 진행
          advanceToStage2Ref.current?.()
        }
      }

      // 카메라 전환 lerp
      if (cameraTransRef.current) {
        const { startTime, duration, fromPos, toPos, fromLook, toLook } = cameraTransRef.current
        const raw = Math.min((now - startTime) / duration, 1)
        const t   = 1 - Math.pow(1 - raw, 3) // ease-out cubic
        camera.position.lerpVectors(fromPos, toPos, t)
        lookAtWork.lerpVectors(fromLook, toLook, t)
        camera.lookAt(lookAtWork)
        if (raw >= 1) cameraTransRef.current = null
      }

      // Q/E 궤도 카메라: 리플레이 2단계 + 전환 완료 후
      if (replayStageRef.current === 2 && !cameraTransRef.current) {
        const angle  = replayOrbitAngleRef.current
        const radius = replayOrbitRadiusRef.current
        camera.position.set(Math.sin(angle) * radius, 1.8, -Math.cos(angle) * radius)
        camera.lookAt(CAM_S2.look)
      }

      renderer.render(scene, camera)
    }
    animate()

    onSceneReadyRef.current()

    return () => {
      glbCancelled = true
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(animFrameRef.current)
      batterMixerRef.current?.stopAllAction()
      pitcherMixerRef.current?.stopAllAction()
      flightTrailRef.current?.geometry.dispose()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 스트라이크존 + 타자 모델 업데이트 ──────────────────────────────────────
  useEffect(() => {
    // currentBatterRef 항상 최신 유지 (GLB 로드 콜백에서도 접근)
    currentBatterRef.current = batter

    if (!batter || !zoneBoxRef.current) return
    const box = zoneBoxRef.current
    const height = batter.zoneTop - batter.zoneBottom
    const midY   = (batter.zoneTop + batter.zoneBottom) / 2

    box.geometry.dispose()
    box.geometry = new THREE.BoxGeometry(batter.zoneHalfWidth * 2, height, 0.02)
    box.position.set(0, midY, 0.01)

    // 테두리 업데이트
    const edges = box.children[0] as THREE.LineSegments
    if (edges) {
      edges.geometry.dispose()
      edges.geometry = new THREE.EdgesGeometry(box.geometry)
    }

    // 타자 GLB 모델 scale/position 업데이트 (이미 로드된 경우)
    if (batterModelRef.current) {
      applyBatterProfile(batterModelRef.current, batter)
    }
  }, [batter])

  // ── 존 표시/숨김 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (zoneBoxRef.current) {
      zoneBoxRef.current.visible = showZone
    }
  }, [showZone])

  // ── 투수 애니메이션: wind_up 시 pitcherForm 클립 전환 + frame60 = 1200ms 동기화 ──
  useEffect(() => {
    const mixer = pitcherMixerRef.current
    if (!mixer || pitchPhase !== 'wind_up') return

    const WINDUP_SEC  = 1.2   // GamePlay.tsx wind_up 지속시간
    const RELEASE_FRAME = 60

    // pitcherForm에 맞는 클립 선택 (없으면 overhand 또는 첫 번째)
    const formName = currentPitch?.pitcherForm ?? 'overhand'
    const clips    = pitcherClipsRef.current
    const clip     = THREE.AnimationClip.findByName(clips, formName)
      ?? THREE.AnimationClip.findByName(clips, 'overhand')
      ?? clips[0]

    if (!clip) return

    // 해당 클립의 FPS로 release 시간 재계산
    const track = clip.tracks[0]
    if (track && track.times.length >= 2) {
      const fps = Math.round(1 / (track.times[1] - track.times[0]))
      pitchReleaseTimeRef.current = RELEASE_FRAME / fps
    }

    // 기존 액션 중지 후 새 클립으로 전환
    mixer.stopAllAction()
    const action = mixer.clipAction(clip)
    action.loop              = THREE.LoopOnce
    action.clampWhenFinished = true
    action.timeScale = pitchReleaseTimeRef.current / WINDUP_SEC
    action.reset().play()
    pitcherActionRef.current = action
  }, [pitchPhase, currentPitch])

  // ── 궤적 커브 빌더 헬퍼 ────────────────────────────────────────────────────
  const getCurve = (pitch: PitchParams) =>
    trajectoryModeRef.current === 'physics'
      ? buildPhysicsCurve(pitch)
      : buildPitchCurve(pitch, pitch.pitcherForm as PitcherForm)

  // ── 투구 애니메이션 시작 ─────────────────────────────────────────────────
  useEffect(() => {
    if (pitchPhase !== 'in_flight' || !currentPitch || !ballRef.current) return

    const curve = getCurve(currentPitch)
    const duration = speedToFlightMs(currentPitch.speed)

    // 공을 시작점에 배치하고 표시
    const startPos = curve.getPoint(0)
    ballRef.current.position.copy(startPos)
    ballRef.current.visible = true

    // 잔상 초기화: 전부 시작점으로 채우고 표시
    if (flightTrailRef.current) {
      const posAttr = flightTrailRef.current.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(i, startPos.x, startPos.y, startPos.z)
      }
      posAttr.needsUpdate = true
      flightTrailRef.current.visible = true
    }

    arrivedRef.current = false
    pitchAnimRef.current = { curve, startTime: performance.now(), duration }

    // 이전 궤적 제거
    if (trailRef.current && sceneRef.current) {
      sceneRef.current.remove(trailRef.current)
      trailRef.current.geometry.dispose()
      trailRef.current = null
    }
  }, [pitchPhase, currentPitch])

  // ── 피드백 단계에서 궤적 라인 표시 ─────────────────────────────────────────
  useEffect(() => {
    if (pitchPhase !== 'feedback' || !currentPitch || !sceneRef.current) return
    const curve = getCurve(currentPitch)
    const points = curve.getPoints(50)
    const geo    = new THREE.BufferGeometry().setFromPoints(points)
    const mat    = new THREE.LineBasicMaterial({ color: 0xffaa00, opacity: 0.6, transparent: true })
    const line   = new THREE.Line(geo, mat)
    sceneRef.current.add(line)
    trailRef.current = line
  }, [pitchPhase, currentPitch])

  // ── 공 숨기기: 미트 도착 즉시(judging) + 대기/와인드업 단계 ─────────────
  useEffect(() => {
    if (pitchPhase === 'judging' || pitchPhase === 'idle' || pitchPhase === 'wind_up') {
      if (ballRef.current) ballRef.current.visible = false
      if (flightTrailRef.current) flightTrailRef.current.visible = false
    }
    if (pitchPhase === 'idle' || pitchPhase === 'wind_up') {
      if (trailRef.current && sceneRef.current) {
        sceneRef.current.remove(trailRef.current)
        trailRef.current.geometry.dispose()
        trailRef.current = null
      }
    }
  }, [pitchPhase])

  // ── 리플레이 시작 (3단계 시스템) ─────────────────────────────────────────
  useEffect(() => {
    if (!replayPitch || !sceneRef.current || !cameraRef.current) return

    const scene  = sceneRef.current
    const camera = cameraRef.current

    // ── 이전 잔재 정리 ────────────────────────────────────────────────────
    clearTimeout(stageTimerRef.current!)
    if (replayTrailRef.current) {
      scene.remove(replayTrailRef.current)
      replayTrailRef.current.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else (mesh.material as THREE.Material).dispose()
        }
      })
      replayTrailRef.current = null
    }
    if (replayDropLineRef.current) {
      scene.remove(replayDropLineRef.current); replayDropLineRef.current.geometry.dispose(); replayDropLineRef.current = null
    }
    if (replayMarkerRef.current) {
      scene.remove(replayMarkerRef.current)
      replayMarkerRef.current.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else (mesh.material as THREE.Material).dispose()
        }
      })
      replayMarkerRef.current = null
    }
    if (replayPlaneGroupRef.current) {
      scene.remove(replayPlaneGroupRef.current)
      replayPlaneGroupRef.current = null
    }
    if (replayBallRef.current) replayBallRef.current.visible = false
    replayAnimRef.current = null
    cameraTransRef.current = null

    // ── 카메라 1단계 위치로 리셋 ─────────────────────────────────────────
    camera.position.copy(CAM_S1.pos)
    camera.lookAt(CAM_S1.look)

    // ── 공 애니메이션 시작 ────────────────────────────────────────────────
    const curve    = getCurve(replayPitch)
    const duration = speedToFlightMs(replayPitch.speed) / replaySpeed

    if (replayBallRef.current) {
      replayBallRef.current.position.copy(curve.getPoint(0))
      replayBallRef.current.visible = true
    }
    replayAnimRef.current = { curve, startTime: performance.now(), duration, done: false }

    // ── 궤적 리본 — 공 뒤를 따라오는 동적 Tube (렌더 루프에서 매 프레임 갱신) ──
    const trailGroup = new THREE.Group()
    // 초기엔 시작점 2개짜리 더미 geometry로 생성, 렌더 루프에서 실시간 확장
    const initPt  = curve.getPoint(0)
    const initPt2 = curve.getPoint(0.001)
    const initCurve = new THREE.CatmullRomCurve3([initPt, initPt2])
    TRAIL_LAYERS.forEach(layer => {
      const mat = new THREE.MeshBasicMaterial({
        color: layer.color, transparent: true, opacity: layer.opacity,
        depthWrite: false, side: layer.side,
      })
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(initCurve, 1, layer.radius, 8, false),
        mat,
      )
      trailGroup.add(mesh)
    })
    trailGroup.visible = false   // 공이 조금 이동한 뒤부터 표시
    scene.add(trailGroup)
    replayTrailRef.current = trailGroup

    // ── ABS 3면 공 통과 위치 마커 그룹 (2단계에서 표시) ──────────────────
    // 각 면에 링+점을 그려 어느 면을 통과했는지 한눈에 확인 가능
    const markerGroup = new THREE.Group()
    const planeDefs: { z: number; hit: boolean | undefined }[] = [
      { z: PLANE_Z.front, hit: replayPitch.frontPlaneHit },
      { z: PLANE_Z.mid,   hit: replayPitch.midPlaneHit   },
      { z: PLANE_Z.end,   hit: replayPitch.endPlaneHit   },
    ]
    planeDefs.forEach(({ z, hit }) => {
      const color   = hit ? 0xff6633 : 0x6688bb
      const opacity = hit ? 0.92     : 0.45
      // 뷰어 방향(z-)으로 살짝 오프셋해 z-fighting 방지
      const mz = z - 0.008

      // 2D ring+dot → 3D 구 로 변경 (hit: 주황, miss: 파랑 반투명)
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 16),
        new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false })
      )
      sphere.position.set(replayPitch.plateX, replayPitch.plateY, mz)
      markerGroup.add(sphere)
    })
    markerGroup.visible = false
    scene.add(markerGroup)
    replayMarkerRef.current = markerGroup

    // ── ABS 3면 박스 생성 (숨김 상태, 2단계에서 표시) ─────────────────────
    const planeGroup = new THREE.Group()
    const zH = batter ? batter.zoneTop - batter.zoneBottom : 0.5
    const zMidY = batter ? (batter.zoneTop + batter.zoneBottom) / 2 : 0.7
    const hw   = batter ? batter.zoneHalfWidth : 0.215

    const planes: { z: number; halfW: number; hit: boolean | undefined; label: string }[] = [
      { z: PLANE_Z.front, halfW: hw + 0.02, hit: replayPitch.frontPlaneHit, label: '앞' },
      { z: PLANE_Z.mid,   halfW: hw + 0.02, hit: replayPitch.midPlaneHit,   label: '중' },
      { z: PLANE_Z.end,   halfW: hw,         hit: replayPitch.endPlaneHit,   label: '끝' },
    ]

    planes.forEach(({ z, halfW, hit }) => {
      const col  = hit ? 0xff6633 : 0x888888
      const opa  = hit ? 0.40     : 0.15
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(halfW * 2, zH, 0.012),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: opa, side: THREE.DoubleSide, depthWrite: false })
      )
      mesh.position.set(0, zMidY, z)
      planeGroup.add(mesh)

      // 테두리
      const edgeMat = new THREE.LineBasicMaterial({ color: hit ? 0xff9966 : 0xaaaaaa })
      const edges   = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat)
      mesh.add(edges)
    })

    planeGroup.visible = false
    scene.add(planeGroup)
    replayPlaneGroupRef.current = planeGroup

    // ── 수직 드롭 라인 (3단계용, 숨김) ────────────────────────────────────
    const dropPoints = [
      new THREE.Vector3(replayPitch.plateX, replayPitch.plateY, 0),
      new THREE.Vector3(replayPitch.plateX, 0, 0),
    ]
    const dropLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(dropPoints),
      new THREE.LineBasicMaterial({ color: 0xff4444, opacity: 0.7, transparent: true })
    )
    dropLine.visible = false
    scene.add(dropLine)
    replayDropLineRef.current = dropLine

    // ── 단계 1 설정 ──────────────────────────────────────────────────────
    replayStageRef.current = 1
    onReplayStageChangeRef.current?.(1)

    // 2단계 궤도 카메라 초기 각도/반경 리셋 (CAM_S2 위치 기준)
    replayOrbitAngleRef.current  = CAM_S2_ORBIT_ANGLE
    replayOrbitRadiusRef.current = CAM_S2_ORBIT_RADIUS

    // ── 단계 2 진행 함수 (공 애니메이션 완료 시 render loop에서 호출) ────────
    advanceToStage2Ref.current = () => {
      if (replayStageRef.current !== 1) return
      replayStageRef.current = 2
      onReplayStageChangeRef.current?.(2)

      // 공 숨기고 3면 마커로 대체
      if (replayBallRef.current) replayBallRef.current.visible = false
      // 마커·플레인 표시
      if (replayMarkerRef.current)    replayMarkerRef.current.visible = true
      if (replayPlaneGroupRef.current) replayPlaneGroupRef.current.visible = true

      // 카메라 2단계로 전환
      cameraTransRef.current = {
        startTime: performance.now(), duration: CAM_LERP_DUR,
        fromPos: camera.position.clone(), toPos: CAM_S2.pos.clone(),
        fromLook: CAM_S1.look.clone(),    toLook: CAM_S2.look.clone(),
      }

      // STAGE_HOLD_MS 후 → 단계 3
      clearTimeout(stageTimerRef.current!)
      stageTimerRef.current = setTimeout(() => {
        replayStageRef.current = 3
        onReplayStageChangeRef.current?.(3)

        // 드롭 라인 표시
        if (replayDropLineRef.current) replayDropLineRef.current.visible = true

        // 카메라 3단계로 전환
        cameraTransRef.current = {
          startTime: performance.now(), duration: CAM_LERP_DUR,
          fromPos: CAM_S2.pos.clone(), toPos: CAM_S3.pos.clone(),
          fromLook: CAM_S2.look.clone(), toLook: CAM_S3.look.clone(),
        }

        // STAGE_HOLD_MS 후 → 리플레이 종료
        stageTimerRef.current = setTimeout(() => {
          onReplayEndRef.current?.()
        }, STAGE_HOLD_MS)
      }, STAGE_HOLD_MS)
    }

    return () => {
      clearTimeout(stageTimerRef.current!)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayPitch, replaySpeed])

  // ── 수동 단계 이동 (← → 키) ─────────────────────────────────────────────
  useEffect(() => {
    if (!replayStageOverride || !cameraRef.current || !replayPitch) return
    const stage = replayStageOverride
    const camera = cameraRef.current

    clearTimeout(stageTimerRef.current!)
    replayStageRef.current = stage
    onReplayStageChangeRef.current?.(stage)

    const targets = [CAM_S1, CAM_S2, CAM_S3]
    const target  = targets[stage - 1]
    const prev    = targets[Math.max(stage - 2, 0)]
    cameraTransRef.current = {
      startTime: performance.now(), duration: CAM_LERP_DUR,
      fromPos: camera.position.clone(), toPos: target.pos.clone(),
      fromLook: prev.look.clone(), toLook: target.look.clone(),
    }

    // 단계별 오브젝트 가시성 조정
    if (replayPlaneGroupRef.current) replayPlaneGroupRef.current.visible = stage >= 2
    if (replayMarkerRef.current)     replayMarkerRef.current.visible     = stage >= 2
    if (replayDropLineRef.current)   replayDropLineRef.current.visible   = stage >= 3
    if (replayBallRef.current) {
      replayBallRef.current.visible = stage < 2
    }

    // 이 단계에서 auto-advance 없이 유지 (수동 조작이므로)
    // stage 2로 진입 시 궤도 카메라 각도 초기화 → CAM_S2 위치에서 시작
    if (stage === 2) replayOrbitAngleRef.current = CAM_S2_ORBIT_ANGLE
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayStageOverride])

  // ── 리플레이 종료/null 시 정리 ────────────────────────────────────────────
  useEffect(() => {
    if (replayPitch !== null) return
    clearTimeout(stageTimerRef.current!)
    replayAnimRef.current = null
    advanceToStage2Ref.current = null

    // 궤도 카메라 비활성화 (stage를 2 이외로 리셋)
    replayStageRef.current = 1

    if (!sceneRef.current) return
    const scene = sceneRef.current

    if (replayBallRef.current) replayBallRef.current.visible = false
    if (replayTrailRef.current) {
      scene.remove(replayTrailRef.current)
      replayTrailRef.current.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else (mesh.material as THREE.Material).dispose()
        }
      })
      replayTrailRef.current = null
    }
    if (replayDropLineRef.current) {
      scene.remove(replayDropLineRef.current); replayDropLineRef.current.geometry.dispose(); replayDropLineRef.current = null
    }
    if (replayMarkerRef.current) {
      scene.remove(replayMarkerRef.current)
      replayMarkerRef.current.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
          else (mesh.material as THREE.Material).dispose()
        }
      })
      replayMarkerRef.current = null
    }
    if (replayPlaneGroupRef.current) {
      scene.remove(replayPlaneGroupRef.current)
      replayPlaneGroupRef.current = null
    }

    // 카메라를 원래 게임 시점(CAM_S1)으로 부드럽게 복귀
    if (cameraRef.current) {
      cameraTransRef.current = {
        startTime: performance.now(), duration: CAM_LERP_DUR,
        fromPos: cameraRef.current.position.clone(),
        toPos:   CAM_S1.pos.clone(),
        fromLook: CAM_S2.look.clone(),   // 리플레이 종료 직전 시선 방향 근사
        toLook:   CAM_S1.look.clone(),
      }
    }
  }, [replayPitch])

  // ── Q/E 궤도 회전 · W/S 줌 · Q/E 입력 시 3단계 자동 전환 억제 ──────────
  useEffect(() => {
    if (!replayPitch) return
    const onKey = (e: KeyboardEvent) => {
      if (replayStageRef.current !== 2) return
      const key = e.key.toLowerCase()
      if (key === 'q') {
        // Q: 오른쪽으로 회전 (방향 반전)
        replayOrbitAngleRef.current += 0.1
        clearTimeout(stageTimerRef.current!)   // 3단계 자동 전환 취소
        stageTimerRef.current = null
      } else if (key === 'e') {
        // E: 왼쪽으로 회전 (방향 반전)
        replayOrbitAngleRef.current -= 0.1
        clearTimeout(stageTimerRef.current!)
        stageTimerRef.current = null
      } else if (key === 'w') {
        // W: 줌인 (최소 1.5m)
        replayOrbitRadiusRef.current = Math.max(1.5, replayOrbitRadiusRef.current - 0.3)
        clearTimeout(stageTimerRef.current!)
        stageTimerRef.current = null
      } else if (key === 's') {
        // S: 줌아웃 (최대 12m)
        replayOrbitRadiusRef.current = Math.min(12, replayOrbitRadiusRef.current + 0.3)
        clearTimeout(stageTimerRef.current!)
        stageTimerRef.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replayPitch])

  return (
    <div
      ref={mountRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

// ── 홈플레이트 3D 오브젝트 ────────────────────────────────────────────────
function buildHomePlate(scene: THREE.Scene) {
  const Y = 0.025   // 바닥에서 약간 위

  // 오각형 면 (위에서 내려다본 모양)
  const shape = new THREE.Shape()
  shape.moveTo(-0.215,  0.145)  // 왼쪽 상단
  shape.lineTo( 0.215,  0.145)  // 오른쪽 상단
  shape.lineTo( 0.215, -0.145)  // 오른쪽 하단
  shape.lineTo( 0,     -0.215)  // 아래 꼭지점
  shape.lineTo(-0.215, -0.145)  // 왼쪽 하단
  shape.closePath()

  // 두께 있는 Extrude 로 입체감 추가
  const extGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.04,
    bevelEnabled: false,
  })
  const plateMesh = new THREE.Mesh(
    extGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  )
  // ExtrudeGeometry는 XY 평면 → XZ 평면으로 회전
  plateMesh.rotation.x = -Math.PI / 2
  plateMesh.position.set(0, Y, 0)
  scene.add(plateMesh)

  // 테두리 (눈에 띄도록 연두색 아웃라인)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(extGeo),
    new THREE.LineBasicMaterial({ color: 0xaaaaaa })
  )
  edges.rotation.x = -Math.PI / 2
  edges.position.set(0, Y + 0.001, 0)
  scene.add(edges)

  // 주변 흙 (타석 구역 약간 밝게)
  const boxArea = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.0),
    new THREE.MeshLambertMaterial({ color: 0xb8956a })
  )
  boxArea.rotation.x = -Math.PI / 2
  boxArea.position.set(0, 0.011, 0.04)
  scene.add(boxArea)

  // ── 배터박스 흰 라인 (KBO 규정 근사: 폭 1.22m × 길이 1.83m) ──────────────
  // 홈플레이트 가장자리(±0.215)에서 0.15m 간격
  const bbY    = 0.028     // 지면 바로 위
  const bbW    = 1.22      // 폭 (m)
  const bbL    = 1.83      // 길이 (m)
  const bbInner = 0.215 + 0.15          // 내측 X (0.365)
  const bbCenterX = bbInner + bbW / 2   // 각 박스 중심 X (0.975)
  const bbCenterZ = 0.04               // 홈플레이트 Z 중심과 대략 일치
  const bbMat  = new THREE.LineBasicMaterial({ color: 0xffffff })

  ;[1, -1].forEach(side => {
    const hw = bbW / 2, hl = bbL / 2
    const pts = [
      new THREE.Vector3(-hw, 0, -hl),
      new THREE.Vector3( hw, 0, -hl),
      new THREE.Vector3( hw, 0,  hl),
      new THREE.Vector3(-hw, 0,  hl),
      new THREE.Vector3(-hw, 0, -hl),
    ]
    const bbLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bbMat)
    bbLine.position.set(side * bbCenterX, bbY, bbCenterZ)
    scene.add(bbLine)
  })
}

// ── 공용 재질 헬퍼 ────────────────────────────────────────────────────────
function mat(color: number, transparent = false, opacity = 1) {
  return new THREE.MeshLambertMaterial({ color, transparent, opacity })
}

// ── 투수 캐릭터 (추후 활성화 예정) ──────────────────────────────────────────
export function buildPitcher(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group()

  const SKIN   = mat(0xf5cba7)
  const UNI    = mat(0x1a237e)   // 어웨이 남색 유니폼
  const CAP    = mat(0x0d1259)
  const PANTS  = mat(0xeceff1)
  const SHOE   = mat(0x111111)

  const legH   = 0.72
  const torsoH = 0.55
  const headR  = 0.13

  // 다리
  const legGeo = new THREE.BoxGeometry(0.11, legH, 0.11)
  const legL = new THREE.Mesh(legGeo, PANTS);  legL.position.set(-0.08, legH / 2, 0)
  const legR = new THREE.Mesh(legGeo, PANTS.clone()); legR.position.set(0.08, legH / 2, 0)
  // 오른발 들어올리기 (와인드업)
  legR.rotation.x = -0.5
  legR.position.y = legH * 0.6
  group.add(legL, legR)

  // 신발
  const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.2)
  const shoeL = new THREE.Mesh(shoeGeo, SHOE); shoeL.position.set(-0.08, 0.035, 0.04)
  group.add(shoeL)

  // 몸통
  const torsoGeo = new THREE.BoxGeometry(0.30, torsoH, 0.20)
  const torso = new THREE.Mesh(torsoGeo, UNI); torso.position.set(0, legH + torsoH / 2, 0)
  group.add(torso)

  // 머리
  const headGeo = new THREE.SphereGeometry(headR, 12, 8)
  const head = new THREE.Mesh(headGeo, SKIN); head.position.set(0, legH + torsoH + headR * 1.1, 0)
  group.add(head)

  // 모자 몸통
  const capBodyGeo = new THREE.CylinderGeometry(headR * 1.02, headR * 1.05, headR * 0.6, 12)
  const capBody = new THREE.Mesh(capBodyGeo, CAP)
  capBody.position.set(0, head.position.y + headR * 0.55, 0)
  group.add(capBody)
  // 모자 챙 (홈플레이트 쪽, -Z 방향)
  const brimGeo = new THREE.BoxGeometry(headR * 0.9, 0.025, headR * 1.6)
  const brim = new THREE.Mesh(brimGeo, CAP.clone())
  brim.position.set(0, head.position.y + headR * 0.2, -headR * 1.1)
  group.add(brim)

  // 투구 팔 (오른팔, 머리 위로 든 상태)
  const armGeo = new THREE.BoxGeometry(0.09, 0.35, 0.09)
  const armR = new THREE.Mesh(armGeo, UNI.clone())
  armR.position.set(0.20, legH + torsoH * 0.75, 0)
  armR.rotation.z = -1.1
  group.add(armR)
  // 전완
  const foreArmGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08)
  const foreArmR = new THREE.Mesh(foreArmGeo, SKIN.clone())
  const armTipX = 0.20 + Math.sin(1.1) * 0.35
  const armTipY = (legH + torsoH * 0.75) + Math.cos(1.1) * 0.35
  foreArmR.position.set(armTipX, armTipY + 0.1, 0)
  foreArmR.rotation.z = -0.4
  group.add(foreArmR)

  // 왼팔 (앞으로 뻗은)
  const armL = new THREE.Mesh(armGeo, UNI.clone())
  armL.position.set(-0.20, legH + torsoH * 0.65, 0)
  armL.rotation.z = 0.4
  group.add(armL)

  // 마운드 위 배치 + 홈플레이트 방향(−Z) 바라보기
  group.position.set(0, 0.25, MOUND_DISTANCE)
  group.rotation.y = Math.PI

  scene.add(group)
  return group
}

// ── 타자 캐릭터 (추후 활성화 예정) ──────────────────────────────────────────
export function buildBatter(scene: THREE.Scene, profile: BatterProfile): THREE.Group {
  const group = new THREE.Group()

  const heightMul = { short: 0.88, medium: 1.0, tall: 1.12 }[profile.height]

  const SKIN    = mat(0xf5cba7)
  const UNI     = mat(0xfafafa)   // 홈 흰 유니폼
  const HELMET  = mat(0xcc1111)   // 빨간 헬멧
  const PANTS   = mat(0xfafafa)
  const SHOE    = mat(0x111111)
  const BAT_MAT = mat(0x8B4513)

  const legH   = 0.72 * heightMul
  const torsoH = 0.52 * heightMul
  const headR  = 0.12 * heightMul

  // 다리
  const legGeo = new THREE.BoxGeometry(0.10, legH, 0.10)
  // 타격 자세: 앞발 약간 벌림
  const legF = new THREE.Mesh(legGeo, PANTS);   legF.position.set(0, legH / 2, 0.12)
  const legB = new THREE.Mesh(legGeo, PANTS.clone()); legB.position.set(0, legH / 2, -0.12)
  legF.rotation.x =  0.12
  legB.rotation.x = -0.12
  group.add(legF, legB)

  // 신발
  const shoeGeo = new THREE.BoxGeometry(0.12, 0.06, 0.22)
  const shoeF = new THREE.Mesh(shoeGeo, SHOE); shoeF.position.set(0, 0.03, 0.18)
  const shoeB = new THREE.Mesh(shoeGeo, SHOE.clone()); shoeB.position.set(0, 0.03, -0.15)
  group.add(shoeF, shoeB)

  // 몸통 (약간 앞으로 기울임)
  const torsoGeo = new THREE.BoxGeometry(0.28, torsoH, 0.20)
  const torso = new THREE.Mesh(torsoGeo, UNI)
  torso.position.set(0, legH + torsoH / 2, 0)
  torso.rotation.x = 0.15
  group.add(torso)

  // 머리
  const headGeo = new THREE.SphereGeometry(headR, 12, 8)
  const head = new THREE.Mesh(headGeo, SKIN)
  head.position.set(0, legH + torsoH + headR * 1.05, 0)
  group.add(head)

  // 헬멧 (반구)
  const helmetGeo = new THREE.SphereGeometry(headR * 1.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)
  const helmetMesh = new THREE.Mesh(helmetGeo, HELMET)
  helmetMesh.position.copy(head.position)
  group.add(helmetMesh)
  // 헬멧 챙 (투수 방향 +Z)
  const helmBrimGeo = new THREE.BoxGeometry(headR * 0.9, 0.022, headR * 1.5)
  const helmBrim = new THREE.Mesh(helmBrimGeo, HELMET.clone())
  helmBrim.position.set(0, head.position.y - headR * 0.25, headR * 1.0)
  group.add(helmBrim)

  // 팔 (배팅 자세 - 양손 앞으로 모아 배트 쥔 형태)
  const armGeo = new THREE.BoxGeometry(0.09, 0.30 * heightMul, 0.09)
  const armY = legH + torsoH * 0.72

  // 좌타 여부에 따라 배팅 팔 배치
  const sideSign = profile.isLefty ? -1 : 1
  const armNear = new THREE.Mesh(armGeo, UNI.clone())
  armNear.position.set(sideSign * 0.18, armY, 0.05)
  armNear.rotation.z = -sideSign * 0.4
  group.add(armNear)

  const armFar = new THREE.Mesh(armGeo, SKIN.clone())
  armFar.position.set(-sideSign * 0.12, armY + 0.04, 0.05)
  armFar.rotation.z = sideSign * 0.3
  group.add(armFar)

  // 배트
  const batGeo = new THREE.CylinderGeometry(0.018, 0.038, 0.88 * heightMul, 8)
  const bat = new THREE.Mesh(batGeo, BAT_MAT)
  bat.position.set(0, armY + 0.18 * heightMul, 0.10)
  bat.rotation.x =  0.25
  bat.rotation.z = -sideSign * 0.55
  group.add(bat)

  // 타석 위치:
  //   우타(isLefty=false): 카메라 기준 왼쪽 → 세계 +X
  //   좌타(isLefty=true) : 카메라 기준 오른쪽 → 세계 −X
  const xPos = profile.isLefty ? -0.82 : 0.82
  group.position.set(xPos, 0, 0.15)
  // 투수 방향(+Z)을 바라보도록 회전 없음 (기본 포즈가 +Z 방향)

  scene.add(group)
  return group
}

function buildStands(scene: THREE.Scene) {
  // ── 더그아웃 (좌/우) ────────────────────────────────────────────────────
  const dugoutWallMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 })
  const dugoutRoofMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 })
  ;[-1, 1].forEach(side => {
    const dg = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 14), dugoutWallMat)
    dg.position.set(side * 18, 1.2, 10)
    scene.add(dg)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.3, 14.4), dugoutRoofMat)
    roof.position.set(side * 18, 2.55, 10)
    scene.add(roof)
  })

  // ── 외야 잔디 줄무늬 (짙은/연한 교대) ──────────────────────────────────
  const grassColors = [0x3d7a35, 0x5a9e50]
  for (let i = 0; i < 8; i++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 5),
      new THREE.MeshLambertMaterial({ color: grassColors[i % 2] })
    )
    strip.rotation.x = -Math.PI / 2
    strip.position.set(0, 0.012, 26 + i * 5)
    scene.add(strip)
  }

  // ── 워닝 트랙 (외야 담장 앞 갈색 띠 4m) ─────────────────────────────────
  const warnTrack = new THREE.Mesh(
    new THREE.PlaneGeometry(74, 4),
    new THREE.MeshLambertMaterial({ color: 0x9e7c50 })
  )
  warnTrack.rotation.x = -Math.PI / 2
  warnTrack.position.set(0, 0.014, 48)
  scene.add(warnTrack)

  // ── 외야 담장 (청록 계열, 약간 높임) ─────────────────────────────────────
  const wallBase = new THREE.Mesh(
    new THREE.BoxGeometry(68, 4, 1),
    new THREE.MeshLambertMaterial({ color: 0x1a5276 })
  )
  wallBase.position.set(0, 2, 51)
  scene.add(wallBase)

  // 담장 상단 노란 안전 패드 띠
  const wallPad = new THREE.Mesh(
    new THREE.BoxGeometry(68, 0.35, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xe8c300 })
  )
  wallPad.position.set(0, 4.2, 50.7)
  scene.add(wallPad)

  // 담장 광고판 패널
  const adColors = [0xcc2200, 0xf39c12, 0x1abc9c, 0x8e44ad, 0x2980b9]
  for (let i = 0; i < 5; i++) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.6),
      new THREE.MeshLambertMaterial({ color: adColors[i] })
    )
    panel.position.set(-24 + i * 12, 2.2, 50.55)
    scene.add(panel)
  }

  // ── 파울 라인 (홈플레이트 모서리 → 외야 담장) ──────────────────────────
  const foulMat = new THREE.LineBasicMaterial({ color: 0xffffff })
  ;[-1, 1].forEach(side => {
    const pts = [
      new THREE.Vector3(side * 0.215, 0.022, 0),
      new THREE.Vector3(side * 38,    0.022, 51),
    ]
    const foulLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), foulMat)
    scene.add(foulLine)
  })
}
