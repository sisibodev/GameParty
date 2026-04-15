import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { PitchParams, PitchPhase, BatterProfile, PitcherForm } from '../types'
import { buildPitchCurve, speedToFlightMs, MOUND_DISTANCE } from '../utils/pitch'

interface Props {
  batter: BatterProfile | null
  currentPitch: PitchParams | null
  pitchPhase: PitchPhase
  showZone: boolean
  onPitchArrived: () => void
  onSceneReady: () => void
  // 리플레이
  replayPitch?: PitchParams | null
  replaySpeed?: number            // 0.25 / 0.5 / 1.0
  onReplayEnd?: () => void
}

export default function BaseballScene({
  batter,
  currentPitch,
  pitchPhase,
  showZone,
  onPitchArrived,
  onSceneReady,
  replayPitch = null,
  replaySpeed = 1,
  onReplayEnd,
}: Props) {
  const mountRef     = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const ballRef      = useRef<THREE.Mesh | null>(null)
  const zoneBoxRef   = useRef<THREE.Mesh | null>(null)
  const trailRef     = useRef<THREE.Line | null>(null)
  const replayTrailRef   = useRef<THREE.Line | null>(null)
  const replayMarkerRef  = useRef<THREE.Mesh | null>(null)
  const animFrameRef = useRef<number>(0)
  // 항상 최신 콜백을 가리키는 ref (stale closure 방지)
  const onPitchArrivedRef = useRef(onPitchArrived)
  const onSceneReadyRef   = useRef(onSceneReady)
  const onReplayEndRef    = useRef(onReplayEnd)
  const pitchAnimRef = useRef<{
    curve: THREE.QuadraticBezierCurve3
    startTime: number
    duration: number
  } | null>(null)
  const replayAnimRef = useRef<{
    curve: THREE.QuadraticBezierCurve3
    startTime: number
    duration: number
    done: boolean
  } | null>(null)
  const arrivedRef    = useRef(false)
  // 리플레이 공 (게임 공과 분리)
  const replayBallRef = useRef<THREE.Mesh | null>(null)

  // 콜백 ref 최신화 (매 렌더마다 동기화)
  useEffect(() => { onPitchArrivedRef.current = onPitchArrived }, [onPitchArrived])
  useEffect(() => { onSceneReadyRef.current   = onSceneReady   }, [onSceneReady])
  useEffect(() => { onReplayEndRef.current    = onReplayEnd    }, [onReplayEnd])

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
      new THREE.SphereGeometry(0.037, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xfafafa })
    )
    ball.visible = false
    ball.castShadow = true
    scene.add(ball)
    ballRef.current = ball

    // ── 리플레이 공 (노란색) ─────────────────────────────────────────────────
    const replayBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.037, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xffee00 })
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

    // ── 외야 스탠드 ──────────────────────────────────────────────────────────
    buildStands(scene)

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
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)

      // 투구 애니메이션
      if (pitchAnimRef.current && ballRef.current) {
        const { curve, startTime, duration } = pitchAnimRef.current
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / duration, 1)
        const pos = curve.getPoint(t)
        ballRef.current.position.copy(pos)

        if (t >= 1 && !arrivedRef.current) {
          arrivedRef.current = true
          pitchAnimRef.current = null
          onPitchArrivedRef.current()
        }
      }

      // 리플레이 애니메이션
      if (replayAnimRef.current && replayBallRef.current && !replayAnimRef.current.done) {
        const { curve, startTime, duration } = replayAnimRef.current
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / duration, 1)
        replayBallRef.current.position.copy(curve.getPoint(t))

        if (t >= 1) {
          replayAnimRef.current.done = true
          onReplayEndRef.current?.()
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    onSceneReadyRef.current()

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(animFrameRef.current)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 투수·타자 캐릭터는 현재 비활성 (추후 활성화 예정)

  // ── 스트라이크존 업데이트 ────────────────────────────────────────────────
  useEffect(() => {
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
  }, [batter])

  // ── 존 표시/숨김 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (zoneBoxRef.current) {
      zoneBoxRef.current.visible = showZone
    }
  }, [showZone])

  // ── 투구 애니메이션 시작 ─────────────────────────────────────────────────
  useEffect(() => {
    if (pitchPhase !== 'in_flight' || !currentPitch || !ballRef.current) return

    const curve = buildPitchCurve(currentPitch, currentPitch.pitcherForm as PitcherForm)
    const duration = speedToFlightMs(currentPitch.speed)

    // 공을 시작점에 배치하고 표시
    const startPos = curve.getPoint(0)
    ballRef.current.position.copy(startPos)
    ballRef.current.visible = true

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
    const curve = buildPitchCurve(currentPitch, currentPitch.pitcherForm as PitcherForm)
    const points = curve.getPoints(50)
    const geo    = new THREE.BufferGeometry().setFromPoints(points)
    const mat    = new THREE.LineBasicMaterial({ color: 0xffaa00, opacity: 0.6, transparent: true })
    const line   = new THREE.Line(geo, mat)
    sceneRef.current.add(line)
    trailRef.current = line
  }, [pitchPhase, currentPitch])

  // ── 다음 투구 준비 시 공 숨기기 ──────────────────────────────────────────
  useEffect(() => {
    if (pitchPhase === 'idle' || pitchPhase === 'wind_up') {
      if (ballRef.current) ballRef.current.visible = false
      if (trailRef.current && sceneRef.current) {
        sceneRef.current.remove(trailRef.current)
        trailRef.current.geometry.dispose()
        trailRef.current = null
      }
    }
  }, [pitchPhase])

  // ── 리플레이 시작 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!replayPitch || !sceneRef.current) return

    const scene = sceneRef.current
    const curve = buildPitchCurve(replayPitch, replayPitch.pitcherForm as PitcherForm)
    const baseDuration = speedToFlightMs(replayPitch.speed)
    const duration = baseDuration / replaySpeed

    // 리플레이 공 시작점 배치
    if (replayBallRef.current) {
      replayBallRef.current.position.copy(curve.getPoint(0))
      replayBallRef.current.visible = true
    }

    replayAnimRef.current = { curve, startTime: performance.now(), duration, done: false }

    // 이전 리플레이 잔재 제거
    if (replayTrailRef.current) {
      scene.remove(replayTrailRef.current)
      replayTrailRef.current.geometry.dispose()
      replayTrailRef.current = null
    }
    if (replayMarkerRef.current) {
      scene.remove(replayMarkerRef.current)
      replayMarkerRef.current.geometry.dispose()
      replayMarkerRef.current = null
    }

    // 궤적 라인
    const points = curve.getPoints(60)
    const geo    = new THREE.BufferGeometry().setFromPoints(points)
    const mat    = new THREE.LineBasicMaterial({ color: 0xffee00, opacity: 0.5, transparent: true })
    const trail  = new THREE.Line(geo, mat)
    scene.add(trail)
    replayTrailRef.current = trail

    // 홈플레이트 통과 지점 마커 (빨강/파랑 링)
    const markerColor = replayPitch.isStrike ? 0xff3333 : 0x3399ff
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.10, 24),
      new THREE.MeshBasicMaterial({ color: markerColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    )
    ring.position.set(replayPitch.plateX, replayPitch.plateY, 0.005)
    scene.add(ring)
    replayMarkerRef.current = ring

    // 리플레이 종료 시 공 숨기기 (별도 타이머)
    const hideTimer = setTimeout(() => {
      if (replayBallRef.current) replayBallRef.current.visible = false
    }, duration + 300)

    return () => {
      clearTimeout(hideTimer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayPitch, replaySpeed])

  // ── 리플레이 종료 시 정리 ─────────────────────────────────────────────────
  useEffect(() => {
    if (replayPitch !== null) return
    // replayPitch가 null로 클리어되면 리플레이 잔재 제거
    if (replayBallRef.current) replayBallRef.current.visible = false
    replayAnimRef.current = null
    if (replayTrailRef.current && sceneRef.current) {
      sceneRef.current.remove(replayTrailRef.current)
      replayTrailRef.current.geometry.dispose()
      replayTrailRef.current = null
    }
    if (replayMarkerRef.current && sceneRef.current) {
      sceneRef.current.remove(replayMarkerRef.current)
      replayMarkerRef.current.geometry.dispose()
      replayMarkerRef.current = null
    }
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
    new THREE.PlaneGeometry(2.0, 1.5),
    new THREE.MeshLambertMaterial({ color: 0xb8956a })
  )
  boxArea.rotation.x = -Math.PI / 2
  boxArea.position.set(0, 0.011, 0)
  scene.add(boxArea)
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
  const standMat = new THREE.MeshLambertMaterial({ color: 0x8b7355 })
  // 좌우 더그아웃 느낌
  const leftStand = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 20), standMat)
  leftStand.position.set(-20, 2, 20)
  scene.add(leftStand)

  const rightStand = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 20), standMat)
  rightStand.position.set(20, 2, 20)
  scene.add(rightStand)

  // 외야 담장
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 })
  const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 1), wallMat)
  wall.position.set(0, 1.5, 50)
  scene.add(wall)
}
