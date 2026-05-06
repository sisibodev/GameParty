/**
 * Task024 멀티플레이 QA 스크립트
 * persistentContext 로 Firebase auth 를 유지한다.
 * 첫 실행: Dev 익명 로그인 → 이후 실행: 기존 세션 재사용
 */

import { chromium } from 'playwright'
import { tmpdir } from 'os'
import { join } from 'path'

const BASE = 'http://localhost:5175/GameParty/'
const PROFILE_DIR = join(tmpdir(), 'playwright-qa-two-bounce')
const TIMEOUT = 20_000

const results = []
function log(msg) {
  console.log(`[QA] ${msg}`)
  results.push(msg)
}

;(async () => {
  // persistentContext: localStorage/IndexedDB 유지 → Firebase auth 세션 지속
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo: 250,
    viewport: { width: 1280, height: 720 },
  })
  const page = await ctx.newPage()

  const rtdbLogs = []
  page.on('console', msg => {
    if (msg.type() === 'debug') rtdbLogs.push(msg.text())
  })

  try {
    // ── 1. /login 페이지에서 Dev 익명 로그인 ──
    await page.goto(`${BASE}login`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    const consoleErrors = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const devBtn = await page.$('button:has-text("Dev 익명 로그인")')
    if (devBtn) {
      await devBtn.click()
      // Firebase 응답 최대 10초 대기
      await page.waitForTimeout(10000)
      log(`로그인 후 URL: ${page.url()}`)
      const bodyText = await page.evaluate(() => document.body.textContent?.slice(0, 200).replace(/\s+/g, ' '))
      log(`로그인 후 body: ${bodyText}`)
      if (consoleErrors.length) log(`콘솔 오류: ${consoleErrors.slice(0,3).join(' | ')}`)
      log('✓ Dev 익명 로그인 시도 완료')
    } else {
      log(`✓ 이미 로그인 상태 (현재 URL: ${page.url()})`)
    }
    await page.waitForTimeout(1000)

    // ── 2. Two Bounce → 멀티 플레이 ──
    await page.goto(`${BASE}game/two-bounce`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    log(`Two Bounce: ${page.url()}`)

    await page.waitForSelector('button:has-text("멀티 플레이")', { timeout: TIMEOUT })
    await page.click('button:has-text("멀티 플레이")')
    await page.waitForURL(/two-bounce\/multi$/, { timeout: TIMEOUT })
    log(`✓ 멀티 메뉴: ${page.url()}`)

    // ── 3. 방 만들기 → /create ──
    await page.waitForSelector('button:has-text("방 만들기")', { timeout: TIMEOUT })
    await page.click('button:has-text("방 만들기")')
    await page.waitForURL(/\/create$/, { timeout: TIMEOUT })
    log(`✓ 방 설정 페이지: ${page.url()}`)

    // 골 수 & 인원 선택
    await page.click('button:has-text("3골")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("2명")')
    await page.waitForTimeout(500)

    // 방 만들기 버튼 활성화 확인
    const btnDisabled = await page.$eval(
      'button:has-text("방 만들기")',
      btn => btn.disabled
    )
    log(`방 만들기 버튼 disabled: ${btnDisabled}`)
    if (btnDisabled) {
      log('✗ 버튼 비활성화 — 3초 추가 대기')
      await page.waitForTimeout(3000)
    }

    // 방 만들기 클릭
    await page.click('button:has-text("방 만들기"):not([disabled])')

    // ── 4. 대기실 ──
    await page.waitForURL(/\/room\/[A-Z0-9]+$/, { timeout: 20000 })
    const roomCode = page.url().split('/room/').pop()
    log(`✓ 대기실: roomCode=${roomCode}`)
    // RTDB 구독 및 렌더링 안정화 대기
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'scripts/qa-02-room.png' })
    const roomBody = (await page.evaluate(() => document.body.textContent?.slice(0, 200).replace(/\s+/g, ' '))) ?? ''
    log(`대기실 body: ${roomBody}`)

    // ── 5. 개발용 게스트 추가 ──
    const guestBtn = await page.$('button:has-text("+ 게스트 추가")')
    if (guestBtn) {
      await guestBtn.click()
      await page.waitForTimeout(3000)
      log('✓ 개발용 게스트 추가')
      const roomBodyAfter = (await page.evaluate(() => document.body.textContent?.slice(0, 300).replace(/\s+/g, ' '))) ?? ''
      log(`게스트 추가 후 body: ${roomBodyAfter}`)
    } else {
      const btns = await page.$$eval('button', b => b.map(e => e.textContent?.trim()))
      log(`✗ 개발용 게스트 버튼 없음, 버튼 목록: ${JSON.stringify(btns)}`)
    }

    // ── 6. 게임 시작 ──
    // 게임 시작 버튼이 활성화될 때까지 대기 (disabled 해제 확인)
    await page.waitForSelector('button:has-text("게임 시작"):not([disabled])', { timeout: TIMEOUT })
    log('게임 시작 버튼 활성화 확인')
    await page.click('button:has-text("게임 시작"):not([disabled])')
    await page.waitForURL(/\/multi\/play\//, { timeout: TIMEOUT })
    log(`✓ 게임 시작: ${page.url()}`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'scripts/qa-03-game.png' })

    // ── 7. HUD & Leave 버튼 ──
    const hud = await page.$('[class*="multiHud"]')
    if (hud) {
      log(`✓ HUD: ${(await hud.textContent() ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)}`)
    } else {
      log('✗ HUD 없음')
    }
    const leaveBtn = await page.$('button:has-text("Leave")')
    log(leaveBtn ? '✓ Leave 버튼 존재' : '✗ Leave 버튼 없음 — BUG')

    // ── 8. DEV 패널 ──
    const devPanel = await page.$('[class*="devPanel"]')
    if (devPanel) {
      const pt = (await devPanel.textContent() ?? '').replace(/\s+/g, ' ').trim()
      log(`✓ DEV 패널: ${pt.slice(0, 180)}`)
    } else {
      log('DEV 패널 없음')
    }

    // ── 9. 슛 발사 ──
    log('슛 발사: Space 1초 충전 → 릴리즈')
    await page.keyboard.down('Space')
    await page.waitForTimeout(1000)
    await page.keyboard.up('Space')

    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'scripts/qa-04-after-shot.png' })

    const flashEl = await page.$('[class*="flashText"]')
    if (flashEl) {
      log(`✓ 플래시 결과: "${(await flashEl.textContent() ?? '').trim()}"`)
    } else {
      log('플래시 없음 (결과 미표시 또는 이미 사라짐)')
    }

    if (devPanel) {
      const panelAfter = (await devPanel.textContent() ?? '').replace(/\s+/g, ' ').trim()
      log(`슛 후 DEV 패널: ${panelAfter.slice(0, 200)}`)
    }

    // RTDB 로그
    const rel = rtdbLogs.filter(t => t.includes('[RTDB]') || t.includes('[MULTI]'))
    if (rel.length) {
      log(`RTDB 로그 (${rel.length}건):`)
      rel.slice(-6).forEach(m => log(`  ${m}`))
    }

    // ── 10. Leave ──
    const leaveFinal = await page.$('button:has-text("Leave")')
    if (leaveFinal) {
      await leaveFinal.click()
      await page.waitForURL(/\/multi/, { timeout: TIMEOUT })
      log(`✓ Leave 후: ${page.url()}`)
    }
    await page.screenshot({ path: 'scripts/qa-05-after-leave.png' })

  } catch (err) {
    log(`✗ 오류: ${err.message}`)
    await page.screenshot({ path: 'scripts/qa-error.png' }).catch(() => {})
  } finally {
    console.log('\n========== QA 최종 결과 ==========')
    results.forEach(r => console.log(r))
    await ctx.close()
  }
})()
