export interface KeyboardState {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  sprint: boolean
}

export interface KeyboardHandle {
  state: KeyboardState
  dispose: () => void
}

const KEY_MAP: Record<string, keyof KeyboardState> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
}

export function createKeyboard(target: Window | HTMLElement = window): KeyboardHandle {
  const state: KeyboardState = {
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
  }

  const handleDown = (ev: Event) => {
    const e = ev as KeyboardEvent
    const bind = KEY_MAP[e.code]
    if (bind) {
      state[bind] = true
      if (e.code.startsWith('Arrow')) e.preventDefault()
    }
  }

  const handleUp = (ev: Event) => {
    const e = ev as KeyboardEvent
    const bind = KEY_MAP[e.code]
    if (bind) state[bind] = false
  }

  target.addEventListener('keydown', handleDown)
  target.addEventListener('keyup', handleUp)

  return {
    state,
    dispose() {
      target.removeEventListener('keydown', handleDown)
      target.removeEventListener('keyup', handleUp)
    },
  }
}
