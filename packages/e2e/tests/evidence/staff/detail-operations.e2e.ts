import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { SLOW_STORY_WAIT } from '../../fixtures/timeouts'

const story = (name: string) => storyUrl(`画面-staff-staffdetailcontainer--${name}`)

const openStory = async (page: Page, name: string) => {
  await page.goto(story(name))
  await expect(page.getByTestId('staff-detail-name')).toBeVisible()
}

/** 復職を拒まれ、タブの上に理由の文が出るまで進める。 */
const refuseReinstate = (page: Page) =>
  step(page, '「…」の「復職にする」を押し、拒まれて、タブの上に理由の文が出る', async () => {
    await page.getByTestId('staff-detail-menu').click()
    await page.getByTestId('staff-detail-reinstate').click()
    await expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
      '退職した職員は変えられません。',
      SLOW_STORY_WAIT,
    )
  })

test.describe('職員の詳細', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test('staff-detail-target-add-loading 権限を変えるで対象の選択肢を読んでいる場合、対象を足すを押せず、読み終えると押せること', async ({
      page,
    }) => {
      await openStory(page, 'slow-target-options')
      // story は開いてから 8 秒で選択肢を読み終えるので、読んでいる間に判定するよう intro を短くする
      await intro(
        page,
        '対象の職員の選択肢を読み終えるまで、対象を足すを押せない\n前提 石川 二葉の職員の詳細（Storybook の SlowTargetOptions）を開いている。対象の職員とチームの選択肢は、読み終えるまで 8 秒かかる（架空のデータ）',
        1_000,
      )

      const dialog = page.getByTestId('staff-policies-dialog')
      await step(
        page,
        '権限を変えるを開き、「指定した職員の予定の閲覧」にチェックを入れる',
        async () => {
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          await dialog.getByTestId('staff-policies-option-schedule.user.read').check()
        },
      )
      // 役職のまとまりにはチームの閲覧の対象を足すがあるので、ほかの権限のまとまりの中だけを見る
      const add = dialog
        .getByTestId('staff-policies-group-other')
        .getByTestId('staff-policies-target-add')
      await check(
        page,
        '選択肢を読んでいる間は「＋ 職員を選ぶ」を押せない。チップの × は押せる',
        async () => {
          await expect(add).toBeDisabled()
          await expect(dialog.getByTestId('staff-policies-target-remove-team-a')).toBeEnabled()
        },
      )

      await step(page, '選択肢を読み終えるまで待ち、「＋ 職員を選ぶ」を押す', async () => {
        await expect(add).toBeEnabled(SLOW_STORY_WAIT)
        await add.click()
      })
      await check(page, '読み終えると押せ、候補の職員が並ぶ', () =>
        expect(dialog.getByTestId('staff-policies-target-options')).toContainText('上田 三奈'),
      )
    })

    test('staff-detail-reinstating 休職の職員の復職にするを送っている場合、メニューを開いたまま復職にしていますを出し、復職にできたら閉じること', async ({
      page,
    }) => {
      await openStory(page, 'slow-reinstate')
      await expect(page.getByTestId('staff-detail-status')).toContainText('休職')
      await intro(
        page,
        '復職にするを送っている間は、メニューに「復職にしています」を出す\n前提 休職の江藤 四郎の職員の詳細（Storybook の SlowReinstate）を開いている。復職は、送ってから 4 秒かかる（架空のデータ）',
      )

      await step(page, '「…」のメニューを開き、「復職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-reinstate').click()
      })
      await check(page, '送っている間は、メニューを開いたまま「復職にしています」を出す', () =>
        expect(page.getByTestId('staff-detail-reinstate')).toHaveText('復職にしています'),
      )
      await check(page, '復職にできると、メニューを閉じ、状態の印の「休職」が消える', async () => {
        await expect(page.getByTestId('staff-detail-menu-list')).toBeHidden(SLOW_STORY_WAIT)
        await expect(page.getByTestId('staff-detail-status')).toBeHidden()
      })
    })

    test('staff-detail-reinstate-refused 復職にできなかった場合、メニューを閉じてタブの上に理由を出すこと', async ({
      page,
    }) => {
      await openStory(page, 'reinstate-refused')
      await intro(
        page,
        '復職にできなかったら、メニューを閉じてタブの上に理由を出す\n前提 休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。ほかの職員の操作で退職にしていたので、復職は 1 秒後に拒まれる（架空のデータ）',
      )

      await step(page, '「…」のメニューを開き、「復職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-reinstate').click()
      })
      await check(
        page,
        'メニューを閉じ、タブの上に「退職した職員は変えられません。」を出す',
        async () => {
          await expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
            '退職した職員は変えられません。',
          )
          await expect(page.getByTestId('staff-detail-menu-list')).toBeHidden()
        },
      )
    })

    test('staff-detail-reinstate-error-keeps-on-tab 復職にできなかった後にタブを替えた場合、復職の失敗の文を出したままにすること', async ({
      page,
    }) => {
      await openStory(page, 'reinstate-refused')
      await intro(
        page,
        'タブを替えても、復職の失敗の文を出したままにする\n前提 休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。復職は 1 秒後に拒まれる（架空のデータ）',
      )

      await refuseReinstate(page)
      await step(page, 'タブの「権限」を押す', async () => {
        await page.getByTestId('staff-detail-tab-policies').click()
        await expect(page.getByTestId('staff-detail-policies')).toBeVisible()
        await page.getByTestId('staff-detail-tab-profile').click()
      })
      await check(page, 'タブの「プロフィール」に戻しても、復職の失敗の文が出ている', async () => {
        await expect(page.getByTestId('staff-detail-profile')).toBeVisible()
        await expect(page.getByTestId('staff-detail-reinstate-error')).toBeVisible()
      })
    })

    test('staff-detail-reinstate-error-cleared-by-dialog 復職にできなかった後に編集のダイアログを開いた場合、復職の失敗の文を消すこと', async ({
      page,
    }) => {
      await openStory(page, 'reinstate-refused')
      await intro(
        page,
        'ほかの操作のダイアログを開くと、復職の失敗の文を消す\n前提 休職の江藤 四郎の職員の詳細（Storybook の ReinstateRefused）を開いている。復職は 1 秒後に拒まれる（架空のデータ）',
      )

      await refuseReinstate(page)
      await step(page, '見出しの「編集」を押し、プロフィールの編集を開く', async () => {
        await page.getByTestId('staff-detail-edit').click()
        await expect(page.getByTestId('staff-detail-edit-dialog')).toBeVisible()
        await page.keyboard.press('Escape')
      })
      await check(
        page,
        '編集のダイアログを閉じた後も、復職の失敗の文は消えたままである',
        async () => {
          await expect(page.getByTestId('staff-detail-edit-dialog')).toBeHidden()
          await expect(page.getByTestId('staff-detail-reinstate-error')).toBeHidden()
        },
      )
    })

    test('staff-detail-reinstate-error-cleared-by-retry 復職にできなかった後にもう一度復職にするを押した場合、送っている間は前の失敗の文を出さないこと', async ({
      page,
    }) => {
      await openStory(page, 'slow-reinstate-refused')
      await intro(
        page,
        'もう一度復職にするを押すと、送っている間は前の失敗の文を消す\n前提 休職の江藤 四郎の職員の詳細（Storybook の SlowReinstateRefused）を開いている。復職は 4 秒後に拒まれる（架空のデータ）',
      )

      await refuseReinstate(page)
      await step(page, 'もう一度「…」の「復職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-reinstate').click()
      })
      await check(
        page,
        'もう一度「復職にする」を押すと、送っている間は前の失敗の文が消える',
        async () => {
          await expect(page.getByTestId('staff-detail-reinstate')).toHaveText('復職にしています')
          await expect(page.getByTestId('staff-detail-reinstate-error')).toBeHidden()
        },
      )
      await check(page, 'また拒まれると、理由の文をもう一度出す', () =>
        expect(page.getByTestId('staff-detail-reinstate-error')).toHaveText(
          '退職した職員は変えられません。',
          SLOW_STORY_WAIT,
        ),
      )
    })

    test('staff-detail-policies-order 権限を変えるを開いた場合、予定の 7 つの権限、職員の管理、照合の順に並ぶこと', async ({
      page,
    }) => {
      await openStory(page, 'default')
      await intro(
        page,
        '権限を変えるダイアログは、予定の 7 つの権限の後に、職員の管理と照合を並べる\n前提 石川 二葉の職員の詳細（Storybook の Default）を開いている（架空のデータ）',
      )

      await step(page, '権限のタブで「権限を変える」を押す', async () => {
        await page.getByTestId('staff-detail-tab-policies').click()
        await page.getByTestId('staff-detail-policies-change').click()
      })
      const other = page.getByTestId('staff-policies-group-other')
      const topOf = async (code: string) =>
        (await other.getByTestId(`staff-policies-option-${code}`).boundingBox())?.y ?? 0
      await check(
        page,
        '「ほかの権限」で、予定の権限（最後は「事業所の全ての予定の編集」）の後に、「職員の管理」「照合」の順で並ぶ',
        async () => {
          await expect(other.getByTestId('staff-policies-option-receipt.check')).toBeVisible()
          const [allEdit, staffManage, receiptCheck] = await Promise.all(
            ['schedule.all.edit', 'staff.manage', 'receipt.check'].map(topOf),
          )
          expect(allEdit).toBeLessThan(staffManage)
          expect(staffManage).toBeLessThan(receiptCheck)
        },
      )
    })

    test('staff-detail-policies-all-refused 送った権限の変更が全て拒まれた場合、権限を変えられませんでしたの前置きで理由を出すこと', async ({
      page,
    }) => {
      await openStory(page, 'self')
      await intro(
        page,
        '送った権限の変更が全て拒まれたら、ほかの変更を保存したとは示さない\n前提 自分（職員の管理の権限を持つ最後の有効な職員）の詳細（Storybook の Self）を開いている（架空のデータ）',
      )

      const dialog = page.getByTestId('staff-policies-dialog')
      await step(page, '権限を変えるで、「職員の管理」のチェックだけを外して保存する', async () => {
        await page.getByTestId('staff-detail-tab-policies').click()
        await page.getByTestId('staff-detail-policies-change').click()
        await dialog.getByTestId('staff-policies-option-staff.manage').uncheck()
        await dialog.getByTestId('staff-policies-submit').click()
      })
      await check(
        page,
        '「権限を変えられませんでした。」の後に理由を出し、「ほかの変更は保存しました。」は出さない',
        () =>
          expect(dialog.getByTestId('staff-policies-error')).toHaveText(
            '権限を変えられませんでした。職員の管理: 職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。',
          ),
      )
    })

    test('staff-detail-profile-save-loading プロフィールの編集で部署の選択肢を読んでいる場合、保存を押せず、読み終えると保存できること', async ({
      page,
    }) => {
      await openStory(page, 'slow-departments')
      await intro(
        page,
        '部署の選択肢を読んでいる間は、プロフィールの編集を保存できない\n前提 石川 二葉の職員の詳細（Storybook の SlowDepartments）を開いている。部署の選択肢は、読み終えるまで 8 秒かかる（架空のデータ）',
      )

      const dialog = page.getByTestId('staff-detail-edit-dialog')
      await step(page, '編集を開き、名前を「石川 双葉」に変える', async () => {
        await page.getByTestId('staff-detail-edit').click()
        await dialog.getByTestId('staff-detail-name-input').fill('石川 双葉')
      })
      await check(page, '部署を読んでいる間は、部署の選択も保存も押せない', async () => {
        await expect(dialog.getByTestId('staff-detail-department-input')).toBeDisabled()
        await expect(dialog.getByTestId('staff-detail-save')).toHaveAttribute(
          'aria-disabled',
          'true',
        )
      })

      await step(page, '部署を読み終えたら、保存を押す', async () => {
        await expect(dialog.getByTestId('staff-detail-department-input')).toBeEnabled(
          SLOW_STORY_WAIT,
        )
        await dialog.getByTestId('staff-detail-save').click()
      })
      await check(page, 'ダイアログを閉じ、名前が「石川 双葉」になる', () =>
        expect(page.getByTestId('staff-detail-name')).toHaveText('石川 双葉'),
      )
    })

    test('staff-detail-profile-options-error プロフィールの編集で部署を読めなかった場合、失敗の文を出し、保存を押せないこと', async ({
      page,
    }) => {
      await openStory(page, 'departments-load-error')
      await intro(
        page,
        '部署を読めなかったら、プロフィールの編集に失敗の文を出し、保存を押せない\n前提 石川 二葉の職員の詳細（Storybook の DepartmentsLoadError）を開いている。部署を読めない（架空のデータ）',
      )

      const dialog = page.getByTestId('staff-detail-edit-dialog')
      await step(page, '編集を押す', () => page.getByTestId('staff-detail-edit').click())
      await check(
        page,
        '「部署とチームを読み込めませんでした。閉じてから、開き直してください。」が出て、保存を押せない',
        async () => {
          await expect(dialog.getByTestId('staff-detail-save-error')).toHaveText(
            '部署とチームを読み込めませんでした。閉じてから、開き直してください。',
          )
          await expect(dialog.getByTestId('staff-detail-save')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
    })

    test('staff-detail-policies-load-error 権限のタブで全ての権限を読めなかった場合、失敗の文と読み直すが出て、読み直すと一覧が出ること', async ({
      page,
    }) => {
      await openStory(page, 'policies-load-error')
      await intro(
        page,
        '全ての権限を読めなかったら、権限のタブに失敗の文と読み直すを出す\n前提 石川 二葉の職員の詳細（Storybook の PoliciesLoadError）を開いている。全ての権限は、1 回目は読めず、2 回目からは読める（架空のデータ）',
      )

      await step(page, 'タブの「権限」を押す', () =>
        page.getByTestId('staff-detail-tab-policies').click(),
      )
      await check(
        page,
        '権限の一覧の位置に失敗の文と読み直すが出て、権限を変えるを押せない',
        async () => {
          await expect(page.getByTestId('staff-detail-policies-error')).toHaveText(
            '権限を読み込めませんでした。時間をおいて、読み直してください。',
          )
          await expect(page.getByTestId('staff-detail-policies-change')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
      await step(page, '「読み直す」を押す', () =>
        page.getByTestId('staff-detail-policies-retry').click(),
      )
      await check(page, '読み直すを押すと、権限をまとまりに分けて並べる', () =>
        expect(page.getByTestId('staff-policy-list')).toBeVisible(),
      )
    })

    test('staff-detail-positions-load-error 役職を読めなかった場合、権限を個別に足した権限に並べず、役職を変えるに失敗の文を出すこと', async ({
      page,
    }) => {
      await openStory(page, 'positions-load-error')
      await intro(
        page,
        '役職を読めなかったら、権限のタブと役職を変えるに失敗の文を出す\n前提 石川 二葉の職員の詳細（Storybook の PositionsLoadError）を開いている。役職を読めない（架空のデータ）',
      )

      await step(page, 'タブの「権限」を押す', () =>
        page.getByTestId('staff-detail-tab-policies').click(),
      )
      await check(
        page,
        '権限を「個別に足した権限」に並べず、失敗の文と読み直すを出す',
        async () => {
          await expect(page.getByTestId('staff-detail-policies-error')).toBeVisible()
          await expect(page.getByTestId('staff-policy-list')).toBeHidden()
        },
      )
      const dialog = page.getByTestId('staff-position-dialog')
      await step(page, 'タブの「プロフィール」に戻り、役職を変えるを押す', async () => {
        await page.getByTestId('staff-detail-tab-profile').click()
        await page.getByTestId('staff-detail-position-change').click()
      })
      await check(
        page,
        '「役職を読み込めませんでした。閉じてから、開き直してください。」が出て、役職を変えるを押せない',
        () =>
          expect(dialog.getByTestId('staff-position-error')).toHaveText(
            '役職を読み込めませんでした。閉じてから、開き直してください。',
          ),
      )
    })

    test('staff-detail-position-note-loading 役職を変えるで役職を読んでいる場合、役職を変えるときの注意を出さず、読み終えると出すこと', async ({
      page,
    }) => {
      await openStory(page, 'slow-positions')
      await intro(
        page,
        '役職を読み終えるまで、役職を変えるときの注意を出さない\n前提 石川 二葉の職員の詳細（Storybook の SlowPositions）を開いている。役職は、読み終えるまで 8 秒かかる（架空のデータ）',
      )

      const dialog = page.getByTestId('staff-position-dialog')
      await step(page, 'プロフィールの「役職を変える」を押す', () =>
        page.getByTestId('staff-detail-position-change').click(),
      )
      await check(page, '役職を読んでいる間は、注意の文を出さない', async () => {
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('staff-position-note')).toHaveCount(0)
      })
      await check(page, '役職を読み終えると、権限が置き換わることを示す注意の文を出す', () =>
        expect(dialog.getByTestId('staff-position-note')).toBeVisible(SLOW_STORY_WAIT),
      )
    })
  })
})
