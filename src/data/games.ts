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
  {
    id: 'cops-and-robbers',
    name: '경찰과 도둑',
    description: '시야 제한 맵에서 도둑이 금고를 털고 탈출, 경찰이 이를 저지하는 팀 대전 (Phase 1 프로토타입)',
    thumbnail: '🕵️',
    path: '/game/cops-and-robbers',
    enabled: true,
    tags: ['멀티', '스텔스', '대전'],
    players: '4~10명',
  },
  {
    id: 'training-arena',
    name: '배틀 그랑프리',
    description: '캐릭터를 성장시키며 매 라운드 토너먼트에 도전하는 싱글플레이 육성 자동전투 시뮬레이션',
    thumbnail: '⚔️',
    path: '/game/training-arena',
    enabled: true,
    tags: ['싱글', '육성', '전략', '자동전투'],
    players: '1인',
  },
]
