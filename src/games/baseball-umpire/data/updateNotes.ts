export type UpdateCategory = '기능 추가' | '구종 수정' | '버그 수정' | '밸런스' | 'UI'

export interface UpdateChange {
  category: UpdateCategory
  text: string
}

export interface UpdateEntry {
  version: string
  date: string
  changes: UpdateChange[]
}

export const UPDATE_HISTORY: UpdateEntry[] = [
  {
    version: '1.3.0',
    date: '2026-04-21',
    changes: [
      { category: '기능 추가', text: '왼손 투수 지원 — 매 5구마다 투수 폼·손 랜덤 변경' },
      { category: '기능 추가', text: '좌측 패널에 투수 폼 및 투구 손 실시간 표시' },
      { category: '기능 추가', text: '업데이트 노트 시스템 추가' },
      { category: '버그 수정', text: '투구 결과창 스트라이크존이 홈플레이트 크기로만 표시되던 문제 수정 — ABS 실효 판정 존으로 변경' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04-20',
    changes: [
      { category: '구종 수정', text: '스위퍼 베지어 아크 스윕 60% 강화 (오버핸드 4→6.4cm, 사이드암 9.5→15cm)' },
      { category: '버그 수정', text: '포크볼·스플리터 언더핸드 폼에서 도착 직전 공이 위로 솟는 U자 궤적 버그 수정' },
      { category: '기능 추가', text: '관리자 랭킹 초기화 기능 (난이도별/전체 선택 가능)' },
      { category: '기능 추가', text: '멀티플레이 투구별 판정 비교표 실시간 표시' },
      { category: '기능 추가', text: '메인 화면 랭킹 바로 보기 버튼 추가' },
      { category: 'UI',       text: '멀티배틀 난이도 선택 UI를 일반 모드 카드 스타일로 통일' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-19',
    changes: [
      { category: '구종 수정', text: '언더핸드 직구 라이징 효과 개선 (+7.6cm)' },
      { category: '구종 수정', text: '전 폼 커브 12-6 솟음 효과 적용 (ctrl1.y > 릴리즈포인트 보장)' },
      { category: '구종 수정', text: '싱커 낙차 강화 — 언더핸드 기준 투심 대비 2.1배 낙차 차이' },
      { category: '구종 수정', text: '스위퍼 오버핸드 글러브사이드 아크 강화' },
      { category: '기능 추가', text: '관리자 에디터 랜덤 투구 버튼 클릭 시 자동 투구 시작' },
      { category: '버그 수정', text: '랭킹 현재 게임 기록만 금색 하이라이트 (이전: 동일 유저 전 기록 강조됨)' },
    ],
  },
]
