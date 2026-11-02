import { type Browser, type Page, expect, test } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  mockUrl,
  recordPrEvidence,
} from '../../fixtures/evidence'
import { pageRoot } from '../../selectors/page'

const LIST = 'patient-list_利用者の一覧/mocks'
const NEW = 'patient-new_利用者の登録/mocks'
const DETAIL = 'patient-detail_利用者の詳細/mocks'

type Steps = Parameters<Parameters<typeof recordPrEvidence>[3]>[0]

/** モックを開いてから、観点の操作を撮る。ログインしないので、prepare では同じモックを開くだけにする */
async function recordMock(
  browser: Browser,
  variant: (typeof EVIDENCE_VARIANTS)[number],
  o: { name: string; title: string; file: string; phone?: boolean },
  body: (steps: Steps & { page: Page }) => Promise<void>,
) {
  await recordPrEvidence(
    browser,
    {
      name: o.name,
      title: o.title,
      actor: 'ログインなし',
      variant,
      ...(o.phone ? { viewport: PHONE_VIEWPORT } : {}),
    },
    async (page) => {
      await page.goto(mockUrl(o.file))
    },
    async (steps) => {
      await steps.page.goto(mockUrl(o.file))
      await body(steps)
    },
  )
}

test.describe('利用者の管理の画面仕様書のモック', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}利用者の一覧のモックを開いた場合、利用中の利用者だけが状態のカラム無しで並び、ヘルプが開き、行を押すと詳細へ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list',
          title:
            '利用者の一覧は、利用中の利用者だけを、名前、担当の職員、サービス、希望のカラムで並べ、? で説明が開く',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('patient-list-filter-status')).toHaveText('状態: 利用中')
          await expect(page.getByTestId('patient-list-count')).toHaveText('3 人')
          await expect(page.getByTestId('patient-list-table')).not.toContainText('状態')
          await check('「状態: 利用中」で「3 人」が出て、状態のカラムが無い')

          await step('? を押す')
          await page.getByTestId('patient-list-help').click()
          await expect(page.getByTestId('patient-list-help-text')).toHaveText(
            '利用の終了の利用者は、予定の利用者の候補に出ません。',
          )
          await check('タイトルの下に、利用の終了の利用者の説明が出る')

          await step('Escape キーを押し、見本 一郎 の行を押す')
          await page.keyboard.press('Escape')
          await page.getByTestId('patient-list-row-{利用者の id}').first().click()
          await expect(page).toHaveURL(/patient-detail_.+\/01-detail\.html/)
          await check('利用者の詳細のモック（01-detail.html）へ移る')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で利用者の一覧のモックを開いた場合、2 行のリストになり、横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-phone',
          title:
            'スマートフォンの幅の利用者の一覧は、1 行目に名前、2 行目に担当の職員、サービス、希望を置く',
          file: `${LIST}/01-list.html`,
          phone: true,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-list-row-{利用者の id}').first()).toHaveCSS(
            'display',
            'flex',
          )
          await expect(pageRoot(page)).toHaveJSProperty('scrollWidth', PHONE_VIEWPORT.width)
          await check(
            '行が 2 行のリストになり、2 行目に担当の職員、サービス、希望が「・」でつながり、横にスクロールしない',
          )
        },
      )
    })

    test(`${prefix}利用者の一覧のモックで状態の絞り込みを押した場合、利用の終了の利用者と利用の終了にした日が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-ended',
          title:
            '「状態: 利用の終了」では、利用の終了の利用者だけを、利用の終了にした日のカラムを足して出す',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('状態の絞り込みで「利用の終了」を選ぶ')
          await page.getByTestId('patient-list-filter-status').click()
          await expect(page).toHaveURL(/02-ended\.html/)
          await expect(page.getByTestId('patient-list-count')).toHaveText('2 人')
          await expect(page.getByTestId('patient-list-ended-on-{利用者の id}').first()).toHaveText(
            '2026/08/31 に利用の終了',
          )
          await check(
            '利用の終了の利用者（02-ended.html）が「2 人」出て、「利用の終了にした日」のカラムに日付が出る',
          )
        },
      )
    })

    test(`${prefix}利用者の一覧で絞り込みに合う利用者がいない場合、利用者が無いことの文が出て、絞り込みを外すで一覧へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-empty',
          title:
            '絞り込みに合う利用者がいないと 利用者が無いことの文が出て、絞り込みを外すで一覧へ戻る',
          file: `${LIST}/03-empty.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('patient-list-empty')).toContainText(
            '条件に合う利用者はいません。',
          )
          await check('名前の検索の「山田」に合う利用者がいないので、利用者が無いことの文が出る')

          await step('「絞り込みを外す」を押す')
          await page.getByTestId('patient-list-filter-clear').click()
          await expect(page).toHaveURL(/01-list\.html/)
          await check('一覧（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}利用者の一覧を読んでいる場合、読み込み中の表示が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-loading',
          title: '利用者を読んでいる間は、一覧の位置に読み込み中の表示が出る',
          file: `${LIST}/04-loading.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-list-loading')).toHaveText('読み込んでいます')
          await check('一覧の位置に「読み込んでいます」が出る')
        },
      )
    })

    test(`${prefix}利用者の一覧を読めなかった場合、失敗の文が出て、読み直すで一覧へ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-error',
          title: '利用者を読めないと失敗の文が出て、読み直すで一覧へ移る',
          file: `${LIST}/05-error.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('patient-list-error')).toHaveText(
            '利用者を読み込めませんでした。時間をおいて、読み直してください。',
          )
          await check('「利用者を読み込めませんでした。」の文が出る')

          await step('「読み直す」を押す')
          await page.getByTestId('patient-list-retry').click()
          await expect(page).toHaveURL(/01-list\.html/)
          await check('一覧（01-list.html）へ移る')
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が利用者の一覧を開いた場合、権限が無い表示が出て、ナビゲーションに職員と利用者が無いこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-list-forbidden',
          title:
            '職員の管理の権限が無いと、権限が無い表示が出て、ナビゲーションに職員と利用者が出ない',
          file: `${LIST}/06-forbidden.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('page-forbidden')).toContainText(
            'この画面を開く権限がありません',
          )
          await expect(page.getByTestId('site-nav-staff')).toHaveCount(0)
          await expect(page.getByTestId('site-nav-patient')).toHaveCount(0)
          await check('権限が無い表示が出て、ナビゲーションに「職員」と「利用者」が無い')
        },
      )
    })

    test(`${prefix}利用者の一覧で利用者を登録を押した場合、選ぶ欄が未選択の登録のダイアログが開き、閉じるで一覧へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-new',
          title: '利用者を登録を押すと、選ぶ欄が未選択の入力のダイアログが開き、閉じるで一覧へ戻る',
          file: `${LIST}/01-list.html`,
        },
        async ({ page, step, check }) => {
          await step('「利用者を登録」を押す')
          await page.getByTestId('patient-list-new').click()
          await expect(page).toHaveURL(/patient-new_.+\/01-initial\.html/)
          await expect(page.getByTestId('patient-new-service')).toHaveText('選んでください')
          await expect(page.getByTestId('patient-new-staff')).toHaveText('選んでください')
          await check(
            '登録のダイアログ（01-initial.html）が開き、サービスと担当の職員が「選んでください」で、希望は選んでいない',
          )

          await step('× を押す')
          await page.getByTestId('patient-new-close').click()
          await expect(page).toHaveURL(/patient-list_.+\/01-list\.html/)
          await check('一覧（01-list.html）へ戻る')
        },
      )
    })

    test(`${prefix}登録のダイアログで何も入れずに登録を押した場合、欄ごとの誤りの文が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-new-invalid',
          title: '名前、サービス、希望の時間帯が無いまま登録を押すと、欄ごとに誤りの文が出る',
          file: `${NEW}/01-initial.html`,
        },
        async ({ page, step, check }) => {
          await step('「登録」を押す')
          await page.getByTestId('patient-new-submit').click()
          await expect(page).toHaveURL(/02-invalid\.html/)
          await expect(page.getByTestId('patient-new-error-{項目}')).toHaveText([
            '名前を入れてください',
            'サービスを選んでください',
            '希望の時間帯を選んでください',
          ])
          await check(
            '入力の誤り（02-invalid.html）で、名前、サービス、希望の時間帯の下に誤りの文が出る',
          )
        },
      )
    })

    test(`${prefix}登録を予定の API が拒んだ場合、理由の文が出ること`, async ({ browser }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-new-submit-error',
          title: '選んだ担当の職員が休職か退職になって登録を拒まれると、理由の文が出る',
          file: `${NEW}/03-submit-error.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-new-submit-error')).toHaveText(
            '選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。',
          )
          await check('登録の失敗（03-submit-error.html）で、フッターの左に理由の文が出る')
        },
      )
    })

    test(`${prefix}利用中の利用者の詳細のモックを開いた場合、状態の印と利用の行が無いこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail',
          title:
            '利用中の利用者の詳細は、見出しと編集と「…」、プロフィールを出し、状態の印と利用の行を出さない',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-detail-name')).toHaveText('見本 一郎')
          await expect(page.getByTestId('patient-detail-profile')).toContainText('森 健太')
          await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)
          await expect(page.getByTestId('patient-detail-status-text')).toHaveCount(0)
          await check(
            '詳細（01-detail.html）に、サービス、希望、担当の職員が出て、状態の印と利用の行が無い',
          )
        },
      )
    })

    test(`${prefix}利用者の詳細のモックで「…」を押した場合、利用の終了にするのメニューが開き、Escape で閉じること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-menu',
          title: '「…」を押すと利用の終了にするのメニューが開き、Escape で閉じる',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('「…」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await expect(page).toHaveURL(/02-menu\.html/)
          await expect(page.getByTestId('patient-detail-end')).toHaveText('利用の終了にする')
          await check('「…」のメニュー（02-menu.html）に、利用の終了にするが出る')

          await step('Escape キーを押す')
          await page.keyboard.press('Escape')
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('メニューが閉じ、詳細（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}利用者の詳細のモックで編集を押した場合、利用者の編集のダイアログが開き、閉じるで戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-edit',
          title: '編集を押すと利用者の編集のダイアログが開き、× で詳細へ戻る',
          file: `${DETAIL}/01-detail.html`,
        },
        async ({ page, step, check }) => {
          await step('「編集」を押す')
          await page.getByTestId('patient-detail-edit').click()
          await expect(page).toHaveURL(/03-edit\.html/)
          await expect(page.getByTestId('patient-detail-edit-dialog')).toContainText(
            '休職と退職の職員と、訪問しない職員は新しく選べず、今の担当のままなら保存できます。',
          )
          await check(
            '利用者の編集のダイアログ（03-edit.html）に、名前、サービス、希望、担当の職員の欄と、担当の職員の注意が出る',
          )

          await step('× を押す')
          await page.getByTestId('patient-detail-edit-close').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('詳細（01-detail.html）へ戻る')
        },
      )
    })

    test(`${prefix}残る予定が無い利用者を利用の終了にした場合、利用の終了の利用者になること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-end',
          title: '残る予定が無ければ、確認のダイアログで利用の終了にでき、利用の終了の利用者になる',
          file: `${DETAIL}/04-end.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          )
          await check(
            '利用の終了の確認（04-end.html）に、戻せることと「今日以降の予定は残っていません。」が出る',
          )

          await step('「利用の終了にする」を押す')
          await page.getByTestId('patient-end-submit').click()
          await expect(page).toHaveURL(/06-ended\.html/)
          await check('利用の終了の利用者（06-ended.html）へ移る')
        },
      )
    })

    test(`${prefix}予定が残る利用者を利用の終了にしようとした場合、残る予定が出て、利用の終了にするが押せないこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-end-refused',
          title: '予定が残る利用者では、残る予定と繰り返しの予定が出て、利用の終了にするが押せない',
          file: `${DETAIL}/02-menu.html`,
        },
        async ({ page, step, check }) => {
          await step('「…」のメニューの「利用の終了にする」を押す')
          await page.getByTestId('patient-detail-end').click()
          await expect(page).toHaveURL(/05-end-refused\.html/)
          await expect(page.getByTestId('patient-end-schedule-{予定の id}')).toHaveCount(2)
          await expect(page.getByTestId('patient-end-recurring-{繰り返しの予定の id}')).toHaveCount(
            1,
          )
          await expect(page.getByTestId('patient-end-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await check(
            '利用の終了を拒む（05-end-refused.html）に、予定 2 件と繰り返しの予定 1 件が出て、「利用の終了にする」が押せない',
          )
        },
      )
    })

    test(`${prefix}利用の終了の利用者の詳細のモックを開いた場合、印と予定の利用者に選べないことが出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-ended',
          title: '利用の終了の利用者の詳細は、利用の終了の印と、予定の利用者に選べないことを出す',
          file: `${DETAIL}/06-ended.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-detail-status')).toHaveText(
            '利用の終了（2026/09/30）',
          )
          await expect(page.getByTestId('patient-detail-status-text')).toHaveText(
            '予定の利用者に選べません。',
          )
          await check(
            '利用の終了の利用者（06-ended.html）に、「利用の終了（2026/09/30）」と「利用: 予定の利用者に選べません。」が出る',
          )
        },
      )
    })

    test(`${prefix}利用の終了の利用者の詳細で「…」を押した場合、利用を再開するのメニューが開くこと`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-ended-menu',
          title: '利用の終了の利用者の「…」には、利用を再開するが出る',
          file: `${DETAIL}/06-ended.html`,
        },
        async ({ page, step, check }) => {
          await step('「…」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await expect(page).toHaveURL(/07-ended-menu\.html/)
          await expect(page.getByTestId('patient-detail-resume')).toHaveText('利用を再開する')
          await check('「…」のメニュー（07-ended-menu.html）に、利用を再開するが出る')
        },
      )
    })

    test(`${prefix}担当の職員が退職した利用者の利用を再開した場合、担当を選び直して詳細へ戻ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-resume',
          title:
            '利用の再開では、今の担当の職員が退職していることが出て、選び直した担当で利用中に戻る',
          file: `${DETAIL}/07-ended-menu.html`,
        },
        async ({ page, step, check }) => {
          await step('「利用を再開する」を押す')
          await page.getByTestId('patient-detail-resume').click()
          await expect(page).toHaveURL(/08-resume\.html/)
          await expect(page.getByTestId('patient-resume-staff-note')).toHaveText(
            '今の担当の 西村 学 は退職しています。担当の職員を選んでください。',
          )
          await check(
            '利用の再開のダイアログ（08-resume.html）に、今の担当が退職している注意と、担当の職員の欄が出る',
          )

          await step('「利用を再開する」を押す')
          await page.getByTestId('patient-resume-submit').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('利用中の利用者の詳細（01-detail.html）へ移る')
        },
      )
    })

    test(`${prefix}利用者の詳細を読んでいる場合、読み込み中の表示が出ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-loading',
          title: '利用者を読んでいる間は、読み込み中の表示が出る',
          file: `${DETAIL}/09-loading.html`,
        },
        async ({ page, check }) => {
          await expect(page.getByTestId('patient-detail-loading')).toHaveText('読み込んでいます')
          await check('「読み込んでいます」が出る')
        },
      )
    })

    test(`${prefix}利用者の詳細を読めなかった場合、失敗の文が出て、読み直すで詳細へ移ること`, async ({
      browser,
    }) => {
      await recordMock(
        browser,
        variant,
        {
          name: 'patient-detail-error',
          title: '利用者を読めないと失敗の文が出て、読み直すで詳細へ移る',
          file: `${DETAIL}/10-error.html`,
        },
        async ({ page, step, check }) => {
          await expect(page.getByTestId('patient-detail-error')).toHaveText(
            '利用者を読み込めませんでした。時間をおいて、読み直してください。',
          )
          await check('「利用者を読み込めませんでした。」の文が出る')

          await step('「読み直す」を押す')
          await page.getByTestId('patient-detail-retry').click()
          await expect(page).toHaveURL(/01-detail\.html/)
          await check('詳細（01-detail.html）へ移る')
        },
      )
    })
  }
})
