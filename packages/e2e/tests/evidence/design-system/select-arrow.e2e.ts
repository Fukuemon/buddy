import { expect, test, type Locator, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { fieldByLabel } from '../../selectors/formField'
import { pageBody } from '../../selectors/page'

const PATIENT_LIST_URL = storyUrl('画面-patient-patientlistcontainer--default')
const LONG_OPTION_URL = storyUrl('コンポーネント-base-select--long-option')
const FORM_FIELD_WITH_HINT_URL = storyUrl('コンポーネント-base-formfield--with-hint')

const SHIFT_STORY = '（撮影のため、字幕に隠れないように下へずらし、2 倍に拡大する）'

/** 字幕の帯に隠れないように story の中身を下へずらし、zoom の倍率で拡大する。撮影のための操作なので、前に字幕で断る。 */
const shiftStory = async (page: Page, zoom = 1) => {
  await page.addStyleTag({
    content: `#storybook-root { padding-top: ${Math.round(72 / zoom)}px; zoom: ${zoom}; }`,
  })
}

/**
 * 選択の欄の、左の余白（欄の左の端から文字まで）と、矢印の印の右の端から欄の右の端までの px。
 * 矢印の印は、select の次に置いた svg である。拡大すると値も拡大されるので、拡大の前に測る。
 */
const arrowGaps = (select: Locator) =>
  select.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const arrow = element.nextElementSibling?.getBoundingClientRect()
    return {
      left: Number.parseFloat(getComputedStyle(element).paddingLeft),
      right: arrow === undefined ? Number.NaN : Math.round(box.right - arrow.right),
    }
  })

test.describe('選択の欄', () => {
  test.describe('矢印の位置（ログインなし、Storybook の story）', () => {
    test('select-arrow-position 利用者の一覧の「担当の職員」の絞り込みを見た場合、矢印が欄の右から 12px の位置にあり、左の文字の余白とそろうこと', async ({
      page,
    }) => {
      await page.goto(PATIENT_LIST_URL)
      const staff = page.getByTestId('patient-list-filter-staff')
      await expect(staff).toBeVisible()
      await intro(
        page,
        '利用者の一覧の「担当の職員」の絞り込みで、矢印の位置と左の余白を見る\n前提 利用者の一覧（Storybook の PatientListContainer の Default）を開いている',
      )

      const gaps = await arrowGaps(staff)
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      await check(
        page,
        `「担当の職員」の絞り込みの矢印は欄の右から ${gaps.right}px にあり、左の文字の余白の ${gaps.left}px とそろう`,
        async () => {
          expect(gaps).toEqual({ left: 12, right: 12 })
        },
      )
    })

    test('select-long-option 長い選択肢を選んだ場合、文字が矢印に重ならないこと', async ({
      page,
    }) => {
      await page.goto(LONG_OPTION_URL)
      const select = fieldByLabel(pageBody(page), '担当の職員')
      await expect(select).toBeVisible()
      await intro(
        page,
        '長い選択肢を選んだ選択の欄で、文字と矢印の間を見る\n前提 長い選択肢を選んだ欄（Storybook の Select の LongOption）を開いている',
      )

      const space = await select.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const textRight = box.right - Number.parseFloat(getComputedStyle(element).paddingRight)
        const arrow = element.nextElementSibling?.getBoundingClientRect()
        return arrow === undefined ? Number.NaN : Math.round(arrow.left - textRight)
      })
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      await check(
        page,
        `文字は矢印の手前で切れ、文字の領域の右の端と矢印の間に ${space}px の余白が残る`,
        async () => {
          expect(space).toBeGreaterThanOrEqual(0)
        },
      )
    })

    test('form-field-select-arrow FormField の補足の文の付いた選択の欄を見た場合、矢印が欄の右から 12px の位置にあり、左の文字の余白とそろうこと', async ({
      page,
    }) => {
      await page.goto(FORM_FIELD_WITH_HINT_URL)
      const select = fieldByLabel(pageBody(page), '担当の職員')
      await expect(select).toBeVisible()
      await intro(
        page,
        'FormField の WithHint の選択の欄で、矢印の位置と左の余白を見る\n前提 補足の文の付いた選択の欄（Storybook の FormField の WithHint）を開いている',
      )

      const gaps = await arrowGaps(select)
      await step(page, SHIFT_STORY, () => shiftStory(page, 2))
      await check(
        page,
        `「担当の職員」の矢印は欄の右から ${gaps.right}px にあり、左の文字の余白の ${gaps.left}px とそろう`,
        async () => {
          expect(gaps).toEqual({ left: 12, right: 12 })
        },
      )
    })
  })
})
