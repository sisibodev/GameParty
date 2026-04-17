export interface KBOTeam {
  id: string
  name: string
  color: string
  abbr: string
  logoUrl: string
}

export const KBO_TEAMS: KBOTeam[] = [
  {
    id: 'lg',
    name: 'LG 트윈스',
    color: '#C30452',
    abbr: 'LG',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/ajpsiq1648069368.png',
  },
  {
    id: 'kt',
    name: 'KT 위즈',
    color: '#333333',
    abbr: 'KT',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/qk8erg1589709962.png',
  },
  {
    id: 'ssg',
    name: 'SSG 랜더스',
    color: '#CE0E2D',
    abbr: 'SSG',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/kii9pd1742225451.png',
  },
  {
    id: 'nc',
    name: 'NC 다이노스',
    color: '#315288',
    abbr: 'NC',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/6gwcg81589708218.png',
  },
  {
    id: 'doosan',
    name: '두산 베어스',
    color: '#6699aa',
    abbr: 'OB',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/2qo9zp1740573854.png',
  },
  {
    id: 'kia',
    name: 'KIA 타이거즈',
    color: '#EA0029',
    abbr: 'KIA',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/2z389i1648069353.png',
  },
  {
    id: 'lotte',
    name: '롯데 자이언츠',
    color: '#002561',
    abbr: 'LT',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/p7q92w1742225576.png',
  },
  {
    id: 'samsung',
    name: '삼성 라이온즈',
    color: '#074CA1',
    abbr: 'SS',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/5u6k511589709673.png',
  },
  {
    id: 'hanwha',
    name: '한화 이글스',
    color: '#FF6600',
    abbr: 'HH',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/7aztmc1740573842.png',
  },
  {
    id: 'kiwoom',
    name: '키움 히어로즈',
    color: '#820024',
    abbr: 'KW',
    logoUrl: 'https://r2.thesportsdb.com/images/media/team/badge/qcj18p1589709259.png',
  },
]

export function getMyTeam(): KBOTeam | null {
  const id = localStorage.getItem('kboTeamId')
  if (!id) return null
  return KBO_TEAMS.find(t => t.id === id) ?? null
}

export function setMyTeam(id: string) {
  localStorage.setItem('kboTeamId', id)
}
