export const TILE_SIZE = 32

export const MAP_COLS = 40
export const MAP_ROWS = 28

export const VIEWPORT_WIDTH = TILE_SIZE * MAP_COLS
export const VIEWPORT_HEIGHT = TILE_SIZE * MAP_ROWS

export const PLAYER_RADIUS = 12

export const THIEF_SPEED = 140
export const COP_SPEED = 180

export const THIEF_VISION_RADIUS = TILE_SIZE * 5
export const COP_VISION_RADIUS = TILE_SIZE * 7

export const COP_BOT_PATROL_SPEED = 90
export const COP_BOT_CHASE_SPEED = 170
export const COP_BOT_ATTACK_RADIUS = TILE_SIZE * 1.2
export const COP_BOT_DETECT_RADIUS = COP_VISION_RADIUS
export const COP_BOT_WAYPOINT_ARRIVE_DIST = TILE_SIZE * 0.8
export const COP_BOT_HIT_COOLDOWN_MS = 1200
export const COP_BOT_SCAN_COOLDOWN_MS = 60000
export const COP_BOT_SCAN_ACTIVE_MS = 2000
export const COP_BOT_SCAN_RADIUS = TILE_SIZE * 7

export const STEALTH_DURATION_MS = 4000
export const STEALTH_COOLDOWN_MS = 15000
export const SMOKE_DURATION_MS = 6000
export const SMOKE_COOLDOWN_MS = 20000
export const SMOKE_RADIUS = TILE_SIZE * 3.5

export const HIT_STACK_MAX = 3

export const SAFE_RADIUS = 14
export const SAFE_INTERACT_RADIUS = TILE_SIZE * 1.3
export const SAFE_DIGITS = 3
export const SAFE_MAX_ATTEMPTS = 6
export const SAFE_EMPTY_RATIO = 0.35
export const SAFE_TREASURE_GOAL_PER_THIEF = 2
export const SAFE_ALARM_DURATION_MS = 8000

export const ESCAPE_ZONE_POS = { x: TILE_SIZE * 36.5, y: TILE_SIZE * 24.5 }
export const ESCAPE_ZONE_RADIUS = TILE_SIZE * 2.2

export const JAIL_POS = { x: TILE_SIZE * 20.5, y: TILE_SIZE * 21.5 }
export const JAIL_RADIUS = TILE_SIZE * 2.5
export const JAIL_RESCUE_WAIT_MS = 180_000 // 3분
export const JAIL_RESCUE_INTERACT_RADIUS = TILE_SIZE * 2.2
export const JAIL_EXIT_OFFSET_X = TILE_SIZE * 3.5 // 구출 후 리스폰 x 오프셋

export const COLORS = {
  floor: 0x2a2f3a,
  floorAlt: 0x242830,
  wall: 0x0f1218,
  wallEdge: 0x1e2430,
  thief: 0x7dd3fc,
  cop: 0xef4444,
  fog: 0x000000,
  hudBg: 0x12151c,
  hudFg: 0xe4e7ef,
  safeLocked: 0xd4af37,
  safeCracking: 0xfbbf24,
  safeTreasure: 0x34d399,
  safeEmpty: 0x6b7280,
  safeAlarm: 0xef4444,
  safeBody: 0x1f2937,
} as const
