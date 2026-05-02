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
  checkGoal,
  isOutOfBounds,
  calcLaunchVelocity,
} from '../utils/physics'

interface Props {
  shotPhase: ShotPhase
  aimAzimuth: number
  aimElevation: number
  power: number
  startPosition: Vec3
  onGoal: () => void
  onMiss: (secondBouncePos: Vec3 | null) => void
}

export default function BasketballScene({
  shotPhase,
  aimAzimuth,
  aimElevation,
  power,
  startPosition,
  onGoal,
  onMiss,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const ballRef = useRef<THREE.Mesh | null>(null)
  const aimLineRef = useRef<THREE.Line | null>(null)
  const nextShotMarkerRef = useRef<THREE.Mesh | null>(null)
  const rafRef = useRef<number>(0)

  // mutable simulation refs (avoid React re-render overhead per frame)
  const ballPosRef = useRef<Vec3>({ ...startPosition })
  const ballVelRef = useRef<Vec3>({ x: 0, y: 0, z: 0 })
  const bounceCountRef = useRef(0)
  const secondBouncePosRef = useRef<Vec3 | null>(null)
  const shotEndedRef = useRef(false)
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fixedCamRef = useRef<{ pos: Vec3; look: Vec3 } | null>(null)
  const lastTimeRef = useRef<number>(0)
  const shotPhaseRef = useRef<ShotPhase>(shotPhase)
  const aimAzimuthRef = useRef(aimAzimuth)
  const aimElevationRef = useRef(aimElevation)
  const onGoalRef = useRef(onGoal)
  const onMissRef = useRef(onMiss)

  useEffect(() => { shotPhaseRef.current = shotPhase }, [shotPhase])
  useEffect(() => { aimAzimuthRef.current = aimAzimuth }, [aimAzimuth])
  useEffect(() => { aimElevationRef.current = aimElevation }, [aimElevation])
  useEffect(() => { onGoalRef.current = onGoal }, [onGoal])
  useEffect(() => { onMissRef.current = onMiss }, [onMiss])

  // reset ball position when start changes
  useEffect(() => {
    ballPosRef.current = { ...startPosition }
    ballVelRef.current = { x: 0, y: 0, z: 0 }
    bounceCountRef.current = 0
    secondBouncePosRef.current = null
    fixedCamRef.current = null
    if (ballRef.current) {
      ballRef.current.position.set(startPosition.x, startPosition.y, startPosition.z)
    }
    if (nextShotMarkerRef.current) {
      nextShotMarkerRef.current.visible = false
    }
  }, [startPosition.x, startPosition.y, startPosition.z])

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
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(5, 10, 5)
    dirLight.castShadow = true
    scene.add(dirLight)

    // court floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshLambertMaterial({ color: 0xc8922a }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    // free-throw line
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.4, transparent: true })
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3, 0.01, PHYSICS.FREE_THROW_POS.z),
        new THREE.Vector3(3, 0.01, PHYSICS.FREE_THROW_POS.z),
      ]),
      lineMat,
    ))

    // backboard
    const bbMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.05, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    )
    bbMesh.position.set(0, 3.225, PHYSICS.BACKBOARD.z - 0.025)
    scene.add(bbMesh)
    bbMesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(bbMesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x333333 }),
    ))

    // pole
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.5, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xaaaaaa }),
    )
    pole.position.set(0, PHYSICS.HOOP_HEIGHT - 0.25, PHYSICS.BACKBOARD.z + 0.3)
    scene.add(pole)

    // rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(PHYSICS.HOOP_RADIUS, 0.02, 8, 32),
      new THREE.MeshLambertMaterial({ color: 0xff6600 }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.set(PHYSICS.HOOP_CENTER.x, PHYSICS.HOOP_CENTER.y, PHYSICS.HOOP_CENTER.z)
    scene.add(rim)

    // simple net
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true })
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const nx = Math.cos(angle) * PHYSICS.HOOP_RADIUS
      const nz = Math.sin(angle) * PHYSICS.HOOP_RADIUS
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(nx, PHYSICS.HOOP_HEIGHT, nz),
          new THREE.Vector3(nx * 0.5, PHYSICS.HOOP_HEIGHT - 0.4, nz * 0.5),
        ]),
        netMat,
      ))
    }

    // ball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(PHYSICS.BALL_RADIUS, 16, 16),
      new THREE.MeshLambertMaterial({ color: 0xff6600 }),
    )
    ball.castShadow = true
    ball.position.set(startPosition.x, startPosition.y, startPosition.z)
    scene.add(ball)
    ballRef.current = ball

    // aim line
    const aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -3),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffff00, opacity: 0.6, transparent: true }),
    )
    scene.add(aimLine)
    aimLineRef.current = aimLine

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

    const animate = (time: number) => {
      rafRef.current = requestAnimationFrame(animate)
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05)
      lastTimeRef.current = time

      const phase = shotPhaseRef.current
      const az = aimAzimuthRef.current
      const el = aimElevationRef.current

      if (phase === 'flying') {
        let pos = ballPosRef.current
        let vel = ballVelRef.current

        const stepped = stepBall(pos, vel, dt)
        pos = stepped.pos
        vel = stepped.vel

        const floorRes = checkFloor(pos, vel)
        if (floorRes.bounced) {
          pos = floorRes.pos
          vel = floorRes.vel
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

        const bbRes = checkBackboard(pos, vel)
        if (bbRes.bounced) {
          pos = bbRes.pos
          vel = bbRes.vel
        }

        ballPosRef.current = pos
        ballVelRef.current = vel
        ball.position.set(pos.x, pos.y, pos.z)

        if (checkGoal(pos, vel.y) && !shotEndedRef.current) {
          shotEndedRef.current = true
          if (bounceTimerRef.current) { clearTimeout(bounceTimerRef.current); bounceTimerRef.current = null }
          onGoalRef.current()
          return
        }
        if (isOutOfBounds(pos, vel) && !shotEndedRef.current) {
          shotEndedRef.current = true
          onMissRef.current(secondBouncePosRef.current)
          return
        }
      }

      // aim line
      if ((phase === 'aiming' || phase === 'charging') && aimLine) {
        const bp = ball.position
        const len = 3
        const ex = bp.x + Math.sin(az) * Math.cos(el) * len
        const ey = bp.y + Math.sin(el) * len
        const ez = bp.z - Math.cos(az) * Math.cos(el) * len
        aimLine.geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array([bp.x, bp.y, bp.z, ex, ey, ez]), 3),
        )
        aimLine.visible = true
      } else {
        aimLine.visible = false
      }

      // camera: fixed at shot position during flight/settled, rotate with mouse
      if ((phase === 'flying' || phase === 'settled') && fixedCamRef.current) {
        const fc = fixedCamRef.current
        camera.position.set(fc.pos.x, fc.pos.y, fc.pos.z)
        camera.lookAt(
          fc.pos.x + Math.sin(az) * Math.cos(el) * 6,
          fc.pos.y + Math.sin(el) * 6,
          fc.pos.z - Math.cos(az) * Math.cos(el) * 6,
        )
      } else {
        const bp = ball.position
        camera.position.set(
          bp.x - Math.sin(az) * 2.0,
          bp.y + 0.8,
          bp.z + Math.cos(az) * 2.0,
        )
        camera.lookAt(
          bp.x + Math.sin(az) * Math.cos(el) * 6,
          bp.y + Math.sin(el) * 6,
          bp.z - Math.cos(az) * Math.cos(el) * 6,
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

  // launch ball when phase becomes 'flying'
  useEffect(() => {
    if (shotPhase !== 'flying') return
    bounceCountRef.current = 0
    secondBouncePosRef.current = null
    shotEndedRef.current = false
    if (bounceTimerRef.current) { clearTimeout(bounceTimerRef.current); bounceTimerRef.current = null }
    if (nextShotMarkerRef.current) nextShotMarkerRef.current.visible = false
    ballPosRef.current = { ...startPosition }
    ballVelRef.current = calcLaunchVelocity(aimAzimuth, aimElevation, power)
    if (ballRef.current) {
      ballRef.current.position.set(startPosition.x, startPosition.y, startPosition.z)
    }
    // 발사 순간의 카메라 위치/방향 고정
    const sp = startPosition
    const az = aimAzimuth
    const el = aimElevation
    fixedCamRef.current = {
      pos: { x: sp.x - Math.sin(az) * 2.0, y: sp.y + 0.8, z: sp.z + Math.cos(az) * 2.0 },
      look: { x: sp.x + Math.sin(az) * Math.cos(el) * 6, y: sp.y + Math.sin(el) * 6, z: sp.z - Math.cos(az) * Math.cos(el) * 6 },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotPhase])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
