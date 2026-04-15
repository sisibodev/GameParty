export interface GameMeta {
  id: string
  name: string
  description: string
  thumbnail: string
  path: string
  enabled: boolean
  tags: string[]
  players: string
}

export const GAMES: GameMeta[] = [
  {
    id: 'stock-boardgame',
    name: '주식 보드게임',
    description: '숨겨진 가격 흐름과 카드 심리전으로 승부하는 주식 투자 게임',
    thumbnail: '📈',
    path: '/game/stock-boardgame',
    enabled: true,
    tags: ['전략', '보드게임', '멀티'],
    players: '2~8명',
  },
  {
    id: 'baseball-umpire',
    name: 'Strike Zone',
    description: '투수가 던진 공을 3D 시점으로 바라보며 스트라이크/볼을 판정하는 주심 체험 게임',
    thumbnail: '⚾',
    path: '/game/baseball-umpire',
    enabled: true,
    tags: ['스포츠', '싱글', '판단력'],
    players: '1인',
  },
]
