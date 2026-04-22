import { Container, Graphics } from 'pixi.js'
import type { SmokeCloud, ThiefAbilities, ThiefAbility, Vec2 } from '../types'
import {
  SMOKE_COOLDOWN_MS,
  SMOKE_DURATION_MS,
  SMOKE_RADIUS,
  STEALTH_COOLDOWN_MS,
  STEALTH_DURATION_MS,
} from '../constants'

export interface AbilitiesHandle {
  abilities: ThiefAbilities
  smokeClouds: SmokeCloud[]
  stealthOverlay: Graphics
  smokeLayer: Container
  tick: (dtMs: number) => void
}

function nextSmokeId(): string {
  return `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function createAbilities(): AbilitiesHandle {
  const abilities: ThiefAbilities = {
    stealth: { state: 'ready', remainingMs: 0 },
    smoke: { state: 'ready', remainingMs: 0 },
  }

  const smokeClouds: SmokeCloud[] = []
  const stealthOverlay = new Graphics()
  const smokeLayer = new Container()
  smokeLayer.label = 'smoke-layer'

  function tick(dtMs: number) {
    tickAbility(abilities.stealth, STEALTH_COOLDOWN_MS, dtMs)
    tickAbility(abilities.smoke, SMOKE_COOLDOWN_MS, dtMs)

    for (let i = smokeClouds.length - 1; i >= 0; i--) {
      smokeClouds[i].remainingMs -= dtMs
      if (smokeClouds[i].remainingMs <= 0) smokeClouds.splice(i, 1)
    }

    drawSmokeClouds(smokeLayer, smokeClouds)
    drawStealthOverlay(stealthOverlay, abilities.stealth)
  }

  return { abilities, smokeClouds, stealthOverlay, smokeLayer, tick }
}

function tickAbility(ability: ThiefAbility, coolMs: number, dtMs: number) {
  if (ability.state === 'active') {
    ability.remainingMs -= dtMs
    if (ability.remainingMs <= 0) {
      ability.state = 'cooldown'
      ability.remainingMs = coolMs
    }
  } else if (ability.state === 'cooldown') {
    ability.remainingMs -= dtMs
    if (ability.remainingMs <= 0) {
      ability.state = 'ready'
      ability.remainingMs = 0
    }
  }
}

export function activateStealth(handle: AbilitiesHandle): boolean {
  if (handle.abilities.stealth.state !== 'ready') return false
  handle.abilities.stealth.state = 'active'
  handle.abilities.stealth.remainingMs = STEALTH_DURATION_MS
  return true
}

export function activateSmoke(handle: AbilitiesHandle, pos: Vec2): boolean {
  if (handle.abilities.smoke.state !== 'ready') return false
  handle.abilities.smoke.state = 'active'
  handle.abilities.smoke.remainingMs = SMOKE_DURATION_MS
  handle.smokeClouds.push({
    id: nextSmokeId(),
    pos: { x: pos.x, y: pos.y },
    remainingMs: SMOKE_DURATION_MS,
  })
  return true
}

export function isStealthed(handle: AbilitiesHandle): boolean {
  return handle.abilities.stealth.state === 'active'
}

function drawSmokeClouds(layer: Container, clouds: SmokeCloud[]) {
  layer.removeChildren()
  for (const cloud of clouds) {
    const alpha = Math.min(0.55, (cloud.remainingMs / SMOKE_DURATION_MS) * 0.7)
    const g = new Graphics()
    g.circle(cloud.pos.x, cloud.pos.y, SMOKE_RADIUS).fill({ color: 0x8da0b8, alpha })
    layer.addChild(g)
  }
}

function drawStealthOverlay(overlay: Graphics, stealth: ThiefAbility) {
  overlay.clear()
  if (stealth.state !== 'active') return
  const alpha = (stealth.remainingMs / STEALTH_DURATION_MS) * 0.35
  overlay.rect(-16, -16, 32, 32).fill({ color: 0x7dd3fc, alpha })
}
