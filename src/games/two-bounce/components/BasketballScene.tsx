import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { ShotPhase, Vec3 } from '../types'
import {
  PHYSICS,
  BALL_HOLD_HEIGHT,
  NEXT_SHOT_DELAY_MS,
  stepBall,
  checkFloor,
  checkBackboard,
  checkBackWall,
  checkRim,
  checkGoal,
  isOutOfBounds,
  calcLaunchVelocity,
} from '../utils/physics'
import { playBackboardSound, playRimSound, playNetSound } from '../utils/sound'

interface Props {
  shotPhase: ShotPhase
  aimAzimuth: number
  aimElevation: number
  power: number
  startPosition: Vec3
  shotKey: number
  onGoal: (nextPos: Vec3) => void
  onGoalScored?: () => void
  onMiss: (secondBouncePos: Vec3 | null) => void
  onBounce?: (speed: number) => void
}

export default function BasketballScene({
  shotPhase,
  aimAzimuth,
  aimElevation,
  power,
  startPosition,
  shotKey,
  onGoal,
  onGoalScored,
  onMiss,
  onBounce,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const ballRef = useRef<THREE.Mesh | null>(null)
  const nextShotMarkerRef = useRef<THREE.Mesh | null>(null)
  const rafRef = useRef<number>(0)

  const ballPosRef = useRef<Vec3>({ ...startPosition })
  const ballVelRef = useRef<Vec3>({ x: 0, y: 0, z: 0 })
  const bounceCountRef = useRef(0)
  const secondBouncePosRef = useRef<Vec3 | null>(null)
  const postGoalSecondBouncePosRef = useRef<Vec3 | null>(null)
  const shotEndedRef = useRef(false)
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fixedCamRef = useRef<{ pos: Vec3; look: Vec3 } | null>(null)
  const lookTargetRef = useRef(new THREE.Vector3(0, PHYSICS.HOOP_HEIGHT, 0))
  const camPosRef = useRef(new THREE.Vector3())
  const tmpVecRef = useRef(new THREE.Vector3())
  const lastTimeRef = useRef<number>(0)
  const shotPhaseRef = useRef<ShotPhase>(shotPhase)
  const aimAzimuthRef = useRef(aimAzimuth)
  const aimElevationRef = useRef(aimElevation)
  const onGoalRef = useRef(onGoal)
  const onGoalScoredRef = useRef(onGoalScored)
  const onMissRef = useRef(onMiss)
  const onBounceRef = useRef(onBounce)

  const flightTimeRef = useRef(0)
  const goalScoredRef = useRef(false)
  const postGoalBounceCountRef = useRef(0)
  const netStrandGeosRef = useRef<THREE.BufferGeometry[]>([])
  const netStrandBaseBotRef = useRef<Array<{ x: number; y: number; z: number }>>([])
  const netRingGeosRef = useRef<THREE.BufferGeometry[]>([])
  const netRingBaseYsRef = useRef<number[]>([])
  const netAnimRef = useRef({ active: false, t: 0 })

  useEffect(() => { shotPhaseRef.current = shotPhase }, [shotPhase])
  useEffect(() => { aimAzimuthRef.current = aimAzimuth }, [aimAzimuth])
  useEffect(() => { aimElevationRef.current = aimElevation }, [aimElevation])
  useEffect(() => { onGoalRef.current = onGoal }, [onGoal])
  useEffect(() => { onGoalScoredRef.current = onGoalScored }, [onGoalScored])
  useEffect(() => { onMissRef.current = onMiss }, [onMiss])
  useEffect(() => { onBounceRef.current = onBounce }, [onBounce])

  useEffect(() => {
    ballPosRef.current = { ...startPosition }
    ballVelRef.current = { x: 0, y: 0, z: 0 }
    bounceCountRef.current = 0
    secondBouncePosRef.current = null
    postGoalSecondBouncePosRef.current = null
    goalScoredRef.current = false
    postGoalBounceCountRef.current = 0
    netAnimRef.current = { active: false, t: 0 }
    fixedCamRef.current = null
    if (ballRef.current) {
      ballRef.current.position.set(startPosition.x, startPosition.y, startPosition.z)
    }
    if (nextShotMarkerRef.current) {
      nextShotMarkerRef.current.visible = false
    }
    // 새 슛 시작 시 카메라/룩타겟을 즉시 새 위치로 점프 (lerp 우회)
    const az = aimAzimuthRef.current
    camPosRef.current.set(
      startPosition.x - Math.sin(az) * 2.0,
      startPosition.y + 0.8,
      startPosition.z + Math.cos(az) * 2.0,
    )
    lookTargetRef.current.set(startPosition.x, startPosition.y, startPosition.z)
    if (cameraRef.current) {
      cameraRef.current.position.copy(camPosRef.current)
      cameraRef.current.lookAt(lookTargetRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotKey])

  // build scene once on mount
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(3, 10, 6)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 2048
    dirLight.shadow.mapSize.height = 2048
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 30
    dirLight.shadow.camera.left = -10
    dirLight.shadow.camera.right = 10
    dirLight.shadow.camera.top = 12
    dirLight.shadow.camera.bottom = -4
    scene.add(dirLight)

    // floor — wood color
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshLambertMaterial({ color: 0xc8922a }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    // court lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.55, transparent: true })
    const addLine = (pts: THREE.Vector3[]) => {
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
    }

    // boundary rectangle
    addLine([
      new THREE.Vector3(-7.5, 0.01, -3),
      new THREE.Vector3(7.5, 0.01, -3),
      new THREE.Vector3(7.5, 0.01, 9.5),
      new THREE.Vector3(-7.5, 0.01, 9.5),
      new THREE.Vector3(-7.5, 0.01, -3),
    ])

    // key / lane sides
    addLine([new THREE.Vector3(-2.45, 0.01, -3), new THREE.Vector3(-2.45, 0.01, PHYSICS.FREE_THROW_POS.z)])
    addLine([new THREE.Vector3(2.45, 0.01, -3), new THREE.Vector3(2.45, 0.01, PHYSICS.FREE_THROW_POS.z)])

    // free throw line
    addLine([
      new THREE.Vector3(-2.45, 0.01, PHYSICS.FREE_THROW_POS.z),
      new THREE.Vector3(2.45, 0.01, PHYSICS.FREE_THROW_POS.z),
    ])

    // free throw circle — top arc facing player
    const ftR = 1.8
    const ftPts: THREE.Vector3[] = []
    for (let i = 0; i <= 36; i++) {
      const a = Math.PI * (i / 36)
      ftPts.push(new THREE.Vector3(Math.cos(a) * ftR, 0.01, PHYSICS.FREE_THROW_POS.z + Math.sin(a) * ftR))
    }
    addLine(ftPts)

    // 3-point arc centered on hoop floor projection
    const tpR = 6.75
    const tpPts: THREE.Vector3[] = []
    for (let i = 0; i <= 64; i++) {
      const a = Math.PI * (-0.62 + 1.24 * (i / 64))
      tpPts.push(new THREE.Vector3(Math.sin(a) * tpR, 0.01, Math.cos(a) * tpR))
    }
    addLine(tpPts)

    // ─── hoop structure ────────────────────────────────────────────────────

    const metalMat = new THREE.MeshLambertMaterial({ color: 0x888888 })

    // main support pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 3.7, 8), metalMat)
    pole.position.set(0, 1.85, -1.5)
    scene.add(pole)

    // horizontal arm connecting pole top to backboard
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.65), metalMat)
    arm.position.set(0, 3.6, -1.175)
    scene.add(arm)

    // backboard
    const bbMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.05, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
    )
    bbMesh.position.set(0, 3.225, PHYSICS.BACKBOARD.z - 0.025)
    bbMesh.receiveShadow = true
    scene.add(bbMesh)
    bbMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(bbMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x333333 }),
    ))

    // orange target square on backboard face
    const tgW = 0.59, tgH = 0.45
    const tgZ = PHYSICS.BACKBOARD.z - 0.055
    const tgY = PHYSICS.HOOP_HEIGHT + 0.05
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-tgW / 2, tgY, tgZ),
        new THREE.Vector3(tgW / 2, tgY, tgZ),
        new THREE.Vector3(tgW / 2, tgY + tgH, tgZ),
        new THREE.Vector3(-tgW / 2, tgY + tgH, tgZ),
        new THREE.Vector3(-tgW / 2, tgY, tgZ),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff6600 }),
    ))

    // back wall
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a2e }),
    )
    backWall.position.set(0, 4, PHYSICS.BACK_WALL_Z)
    backWall.receiveShadow = true
    scene.add(backWall)

    // rim — thicker tube
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(PHYSICS.HOOP_RADIUS, PHYSICS.RIM_TUBE_RADIUS, 8, 32),
      new THREE.MeshLambertMaterial({ color: 0xff6600 }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.set(PHYSICS.HOOP_CENTER.x, PHYSICS.HOOP_CENTER.y, PHYSICS.HOOP_CENTER.z)
    scene.add(rim)

    // net — 12 strands + 3 horizontal rings
    const strandMat = new THREE.LineBasicMaterial({ color: 0xdddddd, opacity: 0.6, transparent: true })
    const ringMat = new THREE.LineBasicMaterial({ color: 0xdddddd, opacity: 0.4, transparent: true })
    const STRAND_COUNT = 12
    const netTopY = PHYSICS.HOOP_HEIGHT
    const netBotY = PHYSICS.HOOP_HEIGHT - 0.4
    const ringDefs = [
      { y: netTopY - 0.12, r: PHYSICS.HOOP_RADIUS * 0.88 },
      { y: netTopY - 0.24, r: PHYSICS.HOOP_RADIUS * 0.68 },
      { y: netTopY - 0.36, r: PHYSICS.HOOP_RADIUS * 0.45 },
    ]

    const hoopZ = PHYSICS.HOOP_CENTER.z

    for (let i = 0; i < STRAND_COUNT; i++) {
      const a = (i / STRAND_COUNT) * Math.PI * 2
      const tx = Math.cos(a) * PHYSICS.HOOP_RADIUS
      const tz = Math.sin(a) * PHYSICS.HOOP_RADIUS
      const botX = tx * 0.35
      const botZ = hoopZ + tz * 0.35
      netStrandBaseBotRef.current.push({ x: botX, y: netBotY, z: botZ })
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(tx, netTopY, hoopZ + tz),
        new THREE.Vector3(botX, netBotY, botZ),
      ])
      netStrandGeosRef.current.push(geo)
      scene.add(new THREE.Line(geo, strandMat))
    }

    for (const { y, r } of ringDefs) {
      const rPts: THREE.Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2
        rPts.push(new THREE.Vector3(Math.cos(a) * r, y, hoopZ + Math.sin(a) * r))
      }
      const geo = new THREE.BufferGeometry().setFromPoints(rPts)
      netRingGeosRef.current.push(geo)
      netRingBaseYsRef.current.push(y)
      scene.add(new THREE.Line(geo, ringMat))
    }

    // ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(PHYSICS.BALL_RADIUS, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd45500, roughness: 0.85, metalness: 0.0 }),
    )
    ball.castShadow = true
    ball.position.set(startPosition.x, startPosition.y, startPosition.z)
    scene.add(ball)
    ballRef.current = ball

    // seam lines — 3 great circles as children (auto-rotate with ball)
    const seamMat = new THREE.LineBasicMaterial({ color: 0x1a0800, opacity: 0.85, transparent: true })
    const R = PHYSICS.BALL_RADIUS
    const SEG = 48
    const circlePoints = (
      ax: (a: number) => number,
      ay: (a: number) => number,
      az: (a: number) => number,
    ): THREE.Vector3[] => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2
        pts.push(new THREE.Vector3(ax(a) * R, ay(a) * R, az(a) * R))
      }
      return pts
    }
    ball.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      circlePoints(Math.cos, () => 0, Math.sin)), seamMat))
    ball.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      circlePoints(Math.cos, Math.sin, () => 0)), seamMat))
    ball.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      circlePoints(() => 0, Math.sin, Math.cos)), seamMat))

    // next shot marker
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16),
      new THREE.MeshLambertMaterial({ color: 0x00ffff, opacity: 0.7, transparent: true }),
    )
    marker.visible = false
    scene.add(marker)
    nextShotMarkerRef.current = marker

    const onResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    // initialize camPos to default aiming position
    camPosRef.current.set(startPosition.x, startPosition.y + 0.8, startPosition.z + 2.0)

    const animate = (time: number) => {
      rafRef.current = requestAnimationFrame(animate)
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05)
      lastTimeRef.current = time

      const phase = shotPhaseRef.current
      const az = aimAzimuthRef.current
      const el = aimElevationRef.current

      if (phase === 'flying') {
        flightTimeRef.current += dt
        let pos = ballPosRef.current
        let vel = ballVelRef.current

        // save pre-step position for crossing-based goal detection
        const prevPos = { ...pos }

        const stepped = stepBall(pos, vel, dt)
        pos = stepped.pos
        vel = stepped.vel

        const floorRes = checkFloor(pos, vel)
        if (floorRes.bounced) {
          pos = floorRes.pos
          vel = floorRes.vel
          const bounceSpeed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
          onBounceRef.current?.(bounceSpeed)

          if (goalScoredRef.current) {
            // post-goal: count 2 bounces then transition
            postGoalBounceCountRef.current += 1
            if (postGoalBounceCountRef.current === 2) {
              postGoalSecondBouncePosRef.current = { x: pos.x, y: BALL_HOLD_HEIGHT, z: pos.z }
            }
            if (postGoalBounceCountRef.current >= 2 && !shotEndedRef.current) {
              shotEndedRef.current = true
              const nextPos = postGoalSecondBouncePosRef.current ?? { ...PHYSICS.FREE_THROW_POS }
              onGoalRef.current(nextPos)
              return
            }
          } else {
            bounceCountRef.current += 1
            if (bounceCountRef.current === 2 && secondBouncePosRef.current === null) {
              secondBouncePosRef.current = { x: pos.x, y: BALL_HOLD_HEIGHT, z: pos.z }
              if (nextShotMarkerRef.current) {
                nextShotMarkerRef.current.position.set(pos.x, 0.01, pos.z)
                nextShotMarkerRef.current.visible = true
              }
              bounceTimerRef.current = setTimeout(() => {
                if (!shotEndedRef.current) {
                  shotEndedRef.current = true
                  onMissRef.current(secondBouncePosRef.current)
                }
              }, NEXT_SHOT_DELAY_MS)
            }
          }
        }

        const bbRes = checkBackboard(pos, vel)
        if (bbRes.bounced) {
          pos = bbRes.pos
          vel = bbRes.vel
          const bbSpeed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
          playBackboardSound(bbSpeed)
        }

        const bwRes = checkBackWall(pos, vel)
        if (bwRes.bounced) {
          pos = bwRes.pos
          vel = bwRes.vel
        }

        const rimRes = checkRim(pos, vel)
        if (rimRes.bounced) {
          pos = rimRes.pos
          vel = rimRes.vel
          const rimSpeed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
          playRimSound(rimSpeed)
        }

        ballPosRef.current = pos
        ballVelRef.current = vel
        ball.position.set(pos.x, pos.y, pos.z)

        // ball rotation based on velocity
        ball.rotation.x += vel.z * dt / PHYSICS.BALL_RADIUS
        ball.rotation.z -= vel.x * dt / PHYSICS.BALL_RADIUS

        // crossing detection: ball must pass through hoop plane top→bottom
        if (checkGoal(prevPos, pos, vel.y) && !goalScoredRef.current && !shotEndedRef.current) {
          goalScoredRef.current = true
          postGoalBounceCountRef.current = 0
          if (bounceTimerRef.current) { clearTimeout(bounceTimerRef.current); bounceTimerRef.current = null }
          netAnimRef.current = { active: true, t: 0 }
          playNetSound()
          onGoalScoredRef.current?.()
          // do NOT return — let ball keep flying for 2 more bounces
        }
        if (flightTimeRef.current > PHYSICS.MIN_FLIGHT_SEC && isOutOfBounds(pos, vel) && !shotEndedRef.current) {
          shotEndedRef.current = true
          if (goalScoredRef.current) {
            const nextPos = postGoalSecondBouncePosRef.current ?? { ...PHYSICS.FREE_THROW_POS }
            onGoalRef.current(nextPos)
          } else {
            onMissRef.current(secondBouncePosRef.current)
          }
          return
        }

        // net animation — drop bottom points on goal, spring back
        if (netAnimRef.current.active) {
          netAnimRef.current.t += dt
          const t = netAnimRef.current.t
          const drop = t < 0.2
            ? (t / 0.2) * 0.22
            : 0.22 * Math.exp(-(t - 0.2) * 5) * Math.abs(Math.cos((t - 0.2) * 10))
          if (t > 1.2) netAnimRef.current.active = false

          for (let i = 0; i < netStrandGeosRef.current.length; i++) {
            const geo = netStrandGeosRef.current[i]
            const base = netStrandBaseBotRef.current[i]
            const arr = geo.attributes.position.array as Float32Array
            arr[3] = base.x
            arr[4] = base.y - drop
            arr[5] = base.z
            geo.attributes.position.needsUpdate = true
          }
          for (let i = 0; i < netRingGeosRef.current.length; i++) {
            const geo = netRingGeosRef.current[i]
            const baseY = netRingBaseYsRef.current[i]
            const ringDrop = drop * (0.4 + i * 0.3)
            const arr = geo.attributes.position.array as Float32Array
            for (let j = 0; j < 25; j++) arr[j * 3 + 1] = baseY - ringDrop
            geo.attributes.position.needsUpdate = true
          }
        }
      }

      // camera
      if ((phase === 'flying' || phase === 'settled') && fixedCamRef.current) {
        const fc = fixedCamRef.current
        camera.position.set(fc.pos.x, fc.pos.y, fc.pos.z)
        camPosRef.current.copy(camera.position)  // keep in sync for post-shot transition
        lookTargetRef.current.lerp(ball.position, Math.min(7 * dt, 1))  // smoother tracking
        camera.lookAt(lookTargetRef.current)
      } else {
        // aiming/charging: lerp toward target for smooth post-shot camera transition
        const bp = ballPosRef.current
        tmpVecRef.current.set(
          bp.x - Math.sin(az) * 2.0,
          bp.y + 0.8,
          bp.z + Math.cos(az) * 2.0,
        )
        camPosRef.current.lerp(tmpVecRef.current, Math.min(8 * dt, 1))
        camera.position.copy(camPosRef.current)
        camera.lookAt(
          bp.x + Math.sin(az) * Math.cos(el) * 6,
          bp.y + Math.sin(el) * 6,
          bp.z - Math.cos(az) * Math.cos(el) * 6,
        )
        // place ball directly in front of camera, lowered to keep crosshair clear
        ball.position.set(
          camera.position.x + Math.sin(az) * Math.cos(el) * 0.55,
          camera.position.y + Math.sin(el) * 0.55 - 0.50,
          camera.position.z - Math.cos(az) * Math.cos(el) * 0.55,
        )
      }

      renderer.render(scene, camera)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // launch ball when phase transitions to 'flying'
  useEffect(() => {
    if (shotPhase !== 'flying') return
    bounceCountRef.current = 0
    secondBouncePosRef.current = null
    shotEndedRef.current = false
    goalScoredRef.current = false
    postGoalBounceCountRef.current = 0
    flightTimeRef.current = 0
    netAnimRef.current = { active: false, t: 0 }
    if (bounceTimerRef.current) { clearTimeout(bounceTimerRef.current); bounceTimerRef.current = null }
    if (nextShotMarkerRef.current) nextShotMarkerRef.current.visible = false

    // launch from visual ball position (where ball appeared during aiming)
    const sp = startPosition
    const az = aimAzimuth
    const el = aimElevation
    const camX = sp.x - Math.sin(az) * 2.0
    const camY = sp.y + 0.8
    const camZ = sp.z + Math.cos(az) * 2.0
    const launchPos: Vec3 = {
      x: camX + Math.sin(az) * Math.cos(el) * 0.55,
      y: camY + Math.sin(el) * 0.55 - 0.50,
      z: camZ - Math.cos(az) * Math.cos(el) * 0.55,
    }
    ballPosRef.current = launchPos
    ballVelRef.current = calcLaunchVelocity(aimAzimuth, aimElevation, power)
    if (ballRef.current) {
      ballRef.current.position.set(launchPos.x, launchPos.y, launchPos.z)
    }
    lookTargetRef.current.set(launchPos.x, launchPos.y, launchPos.z)

    // freeze camera at the aiming position
    fixedCamRef.current = {
      pos: { x: camX, y: camY, z: camZ },
      look: {
        x: sp.x + Math.sin(az) * Math.cos(el) * 6,
        y: sp.y + Math.sin(el) * 6,
        z: sp.z - Math.cos(az) * Math.cos(el) * 6,
      },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotPhase])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
