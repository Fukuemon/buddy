import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const ACTOR = 'ログインなし（Storybook の story）'

// ミニカレンダーの今日と表示の期間を毎回同じにするため、ブラウザの時計を 2026/10/25（日）10:00 から進める。
// ブラウザは Asia/Tokyo で動くので、spec を流す環境の時間帯によらないよう時差を付けて書く
const NOW = new Date('2026-10-25T10:00:00+09:00')
const FEEDBACK_VIEWPORT = { width: 1409, height: 778 }

const open = async (page: Page, story: string) => {
  await page.goto(storyUrl(`画面-schedule-schedulepagelayout--${story}`))
  await expect(page.getByTestId('calendar-title')).toBeVisible()
}

/** ツールバーの右の操作が、表示の期間の見出しと同じ行にあるか。 */
const expectOneRow = async (page: Page) => {
  const title = await page.getByTestId('calendar-title').boundingBox()
  const create = await page.getByTestId('schedule-create-open').boundingBox()
  if (title === null || create === null) throw new Error('見出しか予定を作成のボタンが無い')
  expect(Math.abs(title.y + title.height / 2 - (create.y + create.height / 2))).toBeLessThan(8)
}

test.describe('予定のカレンダー', () => {
  test.describe('ミニカレンダーとツールバーの並び', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}幅 1409px で表示の単位を切り替えた場合、ツールバーの右の操作がどの表示でも見出しと同じ行に出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-toolbar-one-row',
            title: '幅 1409px で、月、週、日と、年をまたぐ週を開き、ツールバーの並びを見る',
            actor: ACTOR,
            variant,
            viewport: FEEDBACK_VIEWPORT,
          },
          (page) => open(page, 'month'),
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await open(page, 'month')
            await step('予定のカレンダーの月の表示（Storybook の SchedulePageLayout）を開いている')
            await expectOneRow(page)
            await check('月の表示で、表示の単位と予定を作成が見出しと同じ行の右端に出る')

            for (const [view, label] of [
              ['week', '週'],
              ['day', '日'],
            ] as const) {
              await step(`表示の単位の「${label}」を押す`)
              await page.getByTestId(`calendar-view-${view}`).check()
              await expect(page.getByTestId(`calendar-view-${view}`)).toBeChecked()
              await expectOneRow(page)
              await check(`${label}の表示でも、表示の単位と予定を作成が見出しと同じ行の右端に出る`)
            }

            await open(page, 'week-across-years')
            await step('見出しが最も長くなる、年をまたぐ週（2026年12月27日〜2027年1月2日）を開く')
            await expectOneRow(page)
            await check('年をまたぐ週でも、表示の単位と予定を作成が見出しと同じ行に出る')
          },
        )
      })

      test(`${prefix}ミニカレンダーの日と前後のボタンを押した場合、日はカレンダーの期間を移し、前後のボタンはミニカレンダーの月だけを動かすこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-mini-calendar',
            title: '週の表示で、ミニカレンダーの日を押し、前後のボタンで月を動かす',
            actor: ACTOR,
            variant,
            viewport: FEEDBACK_VIEWPORT,
          },
          (page) => open(page, 'week'),
          async ({ page, step, check }) => {
            await page.clock.install({ time: NOW })
            await open(page, 'week')
            const title = page.getByTestId('calendar-title')
            const month = page.getByTestId('mini-calendar-month')
            await expect(title).toHaveText('2026年10月25日〜31日')
            await step('週の表示を開いている。左上のミニカレンダーは今日（10月25日）を丸で示す')

            await step('ミニカレンダーの 11月5日を押す')
            await page.getByTestId('mini-calendar-day-2026-11-05').click()
            await expect(title).toHaveText('2026年11月1日〜7日')
            await expect(page.getByTestId('calendar-view-week')).toBeChecked()
            await expect(month).toHaveText('2026年11月')
            await check('表示の単位は週のまま、11月1日〜7日の週がカレンダーに出る')

            await step('ミニカレンダーの次の月のボタンを 2 回押す')
            await page.getByTestId('mini-calendar-next').click()
            await page.getByTestId('mini-calendar-next').click()
            await expect(month).toHaveText('2027年1月')
            await expect(title).toHaveText('2026年11月1日〜7日')
            await check('ミニカレンダーだけが 2027年1月に移り、カレンダーの期間は変わらない')

            await step('ミニカレンダーの前の月のボタンを押す')
            await page.getByTestId('mini-calendar-prev').click()
            await expect(month).toHaveText('2026年12月')
            await expect(title).toHaveText('2026年11月1日〜7日')
            await check('ミニカレンダーだけが 2026年12月に戻り、カレンダーの期間は変わらない')
          },
        )
      })

      test(`${prefix}スマートフォンの幅でドロワーのミニカレンダーの日を押した場合、ドロワーが閉じ、その日を含む期間が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-mini-calendar-phone',
            title:
              'スマートフォンの幅で、ツールバーのボタンからドロワーを開き、ミニカレンダーの日を押す',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=week&date=2026-10-25')
            await expect(page.getByTestId('calendar-title')).toHaveText('2026年10月25日〜31日')
            const drawer = page.getByTestId('site-sidebar-drawer')
            await expect(drawer).toBeHidden()
            await step('幅 390px で週の表示を開いている。日付の欄はツールバーに無い')

            await step('ツールバーの「日付と絞り込み」のボタンを押す')
            await page.getByTestId('site-sidebar-open').click()
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('mini-calendar')).toBeVisible()
            await check('ドロワーにミニカレンダーが出る')

            await step('ミニカレンダーの 10月14日を押す')
            await drawer.getByTestId('mini-calendar-day-2026-10-14').click()
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId('calendar-title')).toHaveText('2026年10月11日〜17日')
            await check('ドロワーが閉じ、10月11日〜17日の週がカレンダーに出る')
          },
        )
      })
    }
  })
})
