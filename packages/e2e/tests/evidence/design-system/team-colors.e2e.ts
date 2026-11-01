import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, STORYBOOK_URL } from '../../fixtures/evidence'
import { catalogTeamColors } from '../../selectors/catalogColors'

const ACTOR = 'ログインなし（Storybook のトークンの色のページ）'
const URL = `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent('トークン-色--docs')}&viewMode=docs`

// チームの色の DADS の値。blue-500、orange-700、magenta-600、cyan-700、yellow-800、purple-500、green-600、lime-800
const TEAM_COLORS = [
  ['blue', 'rgb(73, 121, 245)'],
  ['orange', 'rgb(226, 81, 0)'],
  ['magenta', 'rgb(219, 0, 219)'],
  ['cyan', 'rgb(0, 141, 166)'],
  ['yellow', 'rgb(165, 128, 0)'],
  ['purple', 'rgb(165, 101, 248)'],
  ['green', 'rgb(37, 157, 99)'],
  ['lime', 'rgb(97, 142, 0)'],
] as const

const openColors = async (page: Page) => {
  await page.goto(URL)
  await expect(catalogTeamColors(page).palette).toBeAttached()
}

test.describe('デザインシステム', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}トークンの色のページのチームのセクションを開いた場合、8 色の点が 4 つの面の上と区別の色の横に出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'team-colors',
          title: 'カタログのトークンの色のページで、チームの色の 8 色を見る',
          actor: ACTOR,
          variant,
        },
        openColors,
        async ({ page, step, check }) => {
          await openColors(page)
          await step('トークンの色のページ（Storybook の トークン/色）を開いている')

          const team = catalogTeamColors(page)
          await team.palette.scrollIntoViewIfNeeded()
          await step('チームのセクションまで下に移る')
          await expect(team.palette).toBeVisible()
          await check('team-blue から team-lime の 8 色のトークンが並ぶ')

          await team.dot('primary-surface', 'lime').scrollIntoViewIfNeeded()
          await step('「面の上の点」まで下に移る')
          for (const surface of [
            'surface',
            'surface-canvas',
            'surface-subtle',
            'primary-surface',
          ]) {
            for (const [name, rgb] of TEAM_COLORS) {
              await expect(team.dot(surface, name)).toHaveCSS('background-color', rgb)
            }
          }
          await check(
            `（撮影のため、録画で見分けにくい色の値を出す）surface、surface-canvas、surface-subtle、primary-surface の面ごとに 8 色の点が並ぶ。${TEAM_COLORS.map(([name, rgb]) => `${name} は ${rgb}`).join('、')}`,
          )

          await team.categoricalRow('orange').scrollIntoViewIfNeeded()
          await step('「区別の色と並べる」まで下に移る')
          for (const [name] of TEAM_COLORS) {
            await expect(team.categoricalRow(name)).toBeVisible()
          }
          await check('同じ色相のチームの点と職員の色が並び、チームの点の方が明るい')
        },
      )
    })
  }
})
