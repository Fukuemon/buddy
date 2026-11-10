import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  leaveStaff,
  listPositions,
  listUnits,
  newStaff,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 休職と退職の確認に残る予定の日。今日より後にする。 */
const FUTURE_DATE = '2030-01-09'

/** 撮影の前に職員を 1 人登録して、その ID と名前を返す。 */
const prepareStaff = async (request: APIRequestContext, label: string) => {
  const staff = newStaff(label)
  const id = await registerStaffId(request, await issueManagerToken(), staff)
  return { id, name: staff.name }
}

/** prepareStaff に足して、その職員に今日より後の予定を 1 件作る。 */
const prepareStaffWithSchedule = async (request: APIRequestContext, label: string) => {
  const staff = await prepareStaff(request, label)
  const res = await createNormalSchedule(
    request,
    await issueManagerToken(),
    STAFF_FORM.facilityId,
    {
      staffId: staff.id,
      title: `見本の会議 ${Date.now()}`,
      date: FUTURE_DATE,
    },
  )
  const scheduleId = ((await res.json()) as { id: string }).id
  return { ...staff, scheduleId }
}

/** 職員の詳細の権限のタブで「権限を変える」を開き、「指定した職員の予定の閲覧」に入れる。権限を変えるダイアログを返す。 */
const openUserReadTargets = async (page: Page, id: string) => {
  await page.goto(`/staff/${id}`)
  await page.getByTestId('staff-detail-tab-policies').click()
  await page.getByTestId('staff-detail-policies-change').click()
  const dialog = page.getByTestId('staff-policies-dialog')
  await dialog.getByTestId('staff-policies-option-schedule.user.read').check()
  return dialog
}

test.describe('職員の管理', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('staff-register 職員を登録した場合、詳細へ移り、役職に決まっている権限が付くこと', async ({
      context,
      request,
    }) => {
      const staff = newStaff('evidence')
      const member = (await listPositions(request, await issueManagerToken())).find(
        (p) => p.id === STAFF_FORM.positionId,
      )

      const page = await context.newPage()
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await intro(
        page,
        'メールアドレスと役職で職員を登録すると、詳細へ移り、役職に決まっている権限が付く',
      )

      await check(page, '前提 職員の一覧を開いている', () =>
        expect(page.getByTestId('staff-list-table')).toBeVisible(),
      )
      await step(
        page,
        '「職員を登録」を押し、名前、メールアドレス、役職「メンバー」を入れて登録する',
        async () => {
          await page.getByTestId('staff-list-new').click()
          const dialog = page.getByTestId('staff-new-dialog')
          await dialog.getByTestId('staff-new-name').fill(staff.name)
          await dialog.getByTestId('staff-new-email').fill(staff.email)
          await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
          await dialog.getByTestId('staff-new-submit').click()
        },
      )
      await check(page, '登録した職員の詳細へ移る', () =>
        expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name),
      )

      await step(page, '権限のタブを開く', () =>
        page.getByTestId('staff-detail-tab-policies').click(),
      )
      const group = page.getByTestId('staff-policy-group-position')
      await check(
        page,
        `権限のタブの「役職「${member?.name}」で付く権限」に、役職に決まっている権限が並ぶ`,
        async () => {
          await expect(group).toContainText(`役職「${member?.name}」で付く権限`)
          for (const { code } of member?.policies ?? []) {
            await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
          }
        },
      )
    })

    test('staff-list-filter 一覧を開いた場合、有効の職員がチームの順に並び、休職で絞り込むと戻る予定の日が出ること', async ({
      context,
      request,
    }) => {
      const token = await issueManagerToken()
      const id = await registerStaffId(request, token, newStaff('on-leave'))
      await leaveStaff(request, token, id)

      const page = await context.newPage()
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await intro(
        page,
        '一覧は有効の職員だけをチームの順に出し、休職で絞り込むと戻る予定の日の列が出る',
      )

      await check(
        page,
        '開いた直後は状態が「有効」で、有効の職員だけがチームの順、名前の順に並ぶ',
        async () => {
          await expect(page.getByTestId('staff-list-filter-status')).toHaveValue('active')
          await expect(page.getByTestId(`staff-list-row-${id}`)).toHaveCount(0)
        },
      )
      await step(page, '状態の絞り込みを「休職」にする', async () => {
        await page.getByTestId('staff-list-filter-status').selectOption('on_leave')
      })
      await check(page, '休職の職員だけが並び、「戻る予定の日」の列が出る', () =>
        expect(page.getByTestId(`staff-list-leave-return-${id}`)).toHaveText('戻る予定の日なし'),
      )
    })

    test('staff-edit-profile 職員のプロフィールを編集した場合、詳細と一覧に変えた値が出ること', async ({
      context,
      request,
    }) => {
      const { id, name } = await prepareStaff(request, 'edit')
      const token = await issueManagerToken()
      const team = (await listUnits(request, token, 'teams')).find(
        (t) => t.id !== STAFF_FORM.teamId,
      )
      const department = (await listUnits(request, token, 'departments'))[0]

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
      await intro(page, '名前、電話番号、部署、チームを変えると、詳細と一覧に変えた値が出る')

      await check(page, '前提 撮影の前に登録した職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-name')).toHaveText(name),
      )
      await step(page, '「編集」を押し、名前、電話番号、部署、チームを変えて保存する', async () => {
        await page.getByTestId('staff-detail-edit').click()
        const dialog = page.getByTestId('staff-detail-edit-dialog')
        await dialog.getByTestId('staff-detail-name-input').fill(`${name} 改`)
        await dialog.getByTestId('staff-detail-phone-input').fill('09012345678')
        await dialog.getByTestId('staff-detail-department-input').selectOption(department.id)
        await dialog.getByTestId('staff-detail-team-input').selectOption(team?.id ?? '')
        await dialog.getByTestId('staff-detail-save').click()
      })
      await check(page, '詳細の名前とプロフィールに、変えた値が出る', async () => {
        await expect(page.getByTestId('staff-detail-name')).toHaveText(`${name} 改`)
        await expect(page.getByTestId('staff-detail-profile')).toContainText('09012345678')
        await expect(page.getByTestId('staff-detail-profile')).toContainText(team?.name ?? '')
      })

      await step(page, '職員の一覧を開き、変えた名前で検索する', async () => {
        await page.goto('/staff')
        await page.getByTestId('staff-list-search').fill(`${name} 改`)
      })
      await check(page, '一覧の行にも、変えた名前とチームが出る', () =>
        expect(page.getByTestId(`staff-list-row-${id}`)).toContainText(team?.name ?? ''),
      )
    })

    test('staff-change-position 職員の役職を変えた場合、役職で付く権限が新しい役職のものになること', async ({
      context,
      request,
    }) => {
      const { id } = await prepareStaff(request, 'position')
      const other = (await listPositions(request, await issueManagerToken())).find(
        (p) => p.id !== STAFF_FORM.positionId && !p.policies.some((q) => q.code === 'staff.manage'),
      )

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-position-name')).toBeVisible()
      await intro(page, '役職を変えると、「役職「…」で付く権限」が新しい役職のものになる')

      await check(page, '前提 撮影の前に登録した、役職がメンバーの職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-position-name')).toBeVisible(),
      )
      await step(page, `「役職を変える」を押し、「${other?.name}」に変える`, async () => {
        await page.getByTestId('staff-detail-position-change').click()
        const dialog = page.getByTestId('staff-position-dialog')
        await dialog.getByTestId(`staff-position-option-${other?.id}`).check()
        await dialog.getByTestId('staff-position-submit').click()
        await expect(page.getByTestId('staff-detail-position-name')).toHaveText(other?.name ?? '')
      })
      await step(page, '権限のタブを開く', () =>
        page.getByTestId('staff-detail-tab-policies').click(),
      )
      const group = page.getByTestId('staff-policy-group-position')
      await check(
        page,
        `権限のタブの「役職「${other?.name}」で付く権限」が、新しい役職の権限になる`,
        async () => {
          await expect(group).toContainText(`役職「${other?.name}」で付く権限`)
          for (const { code } of other?.policies ?? []) {
            await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
          }
        },
      )
    })

    test('staff-add-policy 権限を変えるでほかの権限を足した場合、個別に足した権限に入ること', async ({
      context,
      request,
    }) => {
      const { id } = await prepareStaff(request, 'policy')

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-tab-policies').click()
      await expect(page.getByTestId('staff-policy-list')).toBeVisible()
      await intro(page, '権限を変えるでほかの権限を足すと、「個別に足した権限」に入る')

      await check(page, '前提 撮影の前に登録した職員の詳細の、権限のタブを開いている', () =>
        expect(page.getByTestId('staff-policy-list')).toBeVisible(),
      )
      await step(
        page,
        '「権限を変える」を押し、ほかの権限の「事業所の全ての予定の閲覧」に入れて保存する',
        async () => {
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await dialog.getByTestId('staff-policies-option-schedule.all.read').check()
          await dialog.getByTestId('staff-policies-submit').click()
          await expect(dialog).toHaveCount(0)
        },
      )
      await check(page, '「個別に足した権限」に「事業所の全ての予定の閲覧」が入る', () =>
        expect(
          page
            .getByTestId('staff-policy-group-individual')
            .getByTestId('staff-policy-row-schedule.all.read'),
        ).toBeVisible(),
      )
    })

    test('staff-policy-target-focus 権限を変えるで職員の候補に Tab で移った場合、候補にフォーカスの表示が出ること', async ({
      context,
      request,
    }) => {
      const { id } = await prepareStaff(request, 'focus')

      const page = await context.newPage()
      const dialog = await openUserReadTargets(page, id)
      await intro(
        page,
        '権限を変えるで職員の候補に Tab で移ると、候補に focus-ring のフォーカスの表示が出る',
      )

      await check(page, '前提 「権限を変える」で、「指定した職員の予定の閲覧」に入れている', () =>
        expect(dialog.getByTestId('staff-policies-option-schedule.user.read')).toBeChecked(),
      )
      await step(page, '「＋ 職員を選ぶ」を押して候補を開き、Tab で最初の候補に移る', async () => {
        await dialog.getByTestId('staff-policies-target-add').click()
        await expect(dialog.getByTestId('staff-policies-target-options')).toBeVisible()
        await page.keyboard.press('Tab')
      })
      await check(page, '最初の候補にフォーカスの表示が出る', () =>
        expect(dialog.getByTestId(/^staff-policies-target-option-/).first()).toBeFocused(),
      )
    })

    test('staff-policy-target-keyboard 権限を変えるで職員の名前を入れてキーボードで足し、× で外した場合、チップが増えて減り、フォーカスが足す欄に戻ること', async ({
      context,
      request,
    }) => {
      const { id } = await prepareStaff(request, 'chip')

      const page = await context.newPage()
      const dialog = await openUserReadTargets(page, id)
      const add = dialog.getByTestId('staff-policies-target-add')
      await expect(add).toBeVisible()
      await intro(
        page,
        '権限を変えるで、職員の名前で絞った候補を ↓ と Enter で足し、× で外し、Escape で候補だけを閉じる',
      )

      await check(page, '前提 「権限を変える」で、「指定した職員の予定の閲覧」に入れている', () =>
        expect(add).toBeVisible(),
      )
      await step(
        page,
        `「＋ 職員を選ぶ」に「${LEADER.staff.name}」と入れ、↓ で候補に移る`,
        async () => {
          await add.fill(LEADER.staff.name)
          await page.keyboard.press('ArrowDown')
        },
      )
      await check(
        page,
        `候補が「${LEADER.staff.name}」に絞られ、その候補にフォーカスの表示が出る`,
        () =>
          expect(
            dialog.getByTestId(`staff-policies-target-option-${LEADER.staff.id}`),
          ).toBeFocused(),
      )

      await step(page, 'Enter で足す', () => page.keyboard.press('Enter'))
      const chip = dialog.getByTestId(`staff-policies-target-${LEADER.staff.id}`)
      await check(page, '選んだ職員がチップで並び、フォーカスが足す欄に戻る', async () => {
        await expect(chip).toBeVisible()
        await expect(add).toBeFocused()
      })

      await step(page, 'チップの × を押して外す', () =>
        dialog.getByTestId(`staff-policies-target-remove-${LEADER.staff.id}`).click(),
      )
      await check(page, 'チップが消え、フォーカスが足す欄に戻る', async () => {
        await expect(chip).toHaveCount(0)
        await expect(add).toBeFocused()
      })

      await step(page, 'もう一度候補を開き、Escape キーを押す', async () => {
        await add.click()
        await expect(dialog.getByTestId('staff-policies-target-options')).toBeVisible()
        await page.keyboard.press('Escape')
      })
      await check(page, '候補だけが閉じ、権限を変えるのダイアログは開いたままである', async () => {
        await expect(dialog.getByTestId('staff-policies-target-options')).toHaveCount(0)
        await expect(dialog).toBeVisible()
      })
    })

    test('staff-leave 職員を休職にした場合、今日以降の予定が出て、状態が休職になること', async ({
      context,
      request,
    }) => {
      const { id, scheduleId } = await prepareStaffWithSchedule(request, 'leave')

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
      await intro(page, '休職にすると、今日以降の予定が一覧で出て、確定すると状態が休職になる')

      await check(
        page,
        '前提 撮影の前に登録し、2030年1月9日（水）の予定を作った職員の詳細を開いている',
        () => expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      const dialog = page.getByTestId('staff-leave-dialog')
      await step(page, '「…」から「休職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-leave').click()
      })
      await check(page, '確認のダイアログに、今日以降に残る予定が出る', () =>
        expect(dialog.getByTestId(`staff-leave-assignment-schedule-${scheduleId}`)).toContainText(
          '2030年1月9日（水）',
        ),
      )

      await step(page, '「休職にする」を押して確定する', () =>
        dialog.getByTestId('staff-leave-submit').click(),
      )
      await check(page, '状態の印が「休職」になる', () =>
        expect(page.getByTestId('staff-detail-status')).toHaveText('休職'),
      )
    })

    test('staff-reinstate 休職の職員を復職にした場合、有効に戻ること', async ({
      context,
      request,
    }) => {
      const { id } = await prepareStaff(request, 'reinstate')
      await leaveStaff(request, await issueManagerToken(), id)

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
      await intro(page, '休職の職員を復職にすると、休職の印が消えて有効に戻る')

      await check(page, '前提 撮影の前に休職にした職員の詳細を開いている', () =>
        expect(page.getByTestId('staff-detail-status')).toHaveText('休職'),
      )
      await step(page, '「…」から「復職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-reinstate').click()
      })
      await check(page, '休職の印と在籍の文が消え、有効に戻る', async () => {
        await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
        await expect(page.getByTestId('staff-detail-status-text')).toHaveCount(0)
      })
    })

    test('staff-retire-refused 予定が残る職員を退職にしようとした場合、退職を確定できないこと', async ({
      context,
      request,
    }) => {
      const { id, name, scheduleId } = await prepareStaffWithSchedule(request, 'retire')

      const page = await context.newPage()
      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
      await intro(
        page,
        '予定が残る職員を退職にしようとすると、残る予定が出て、退職にするを押せない',
      )

      await check(
        page,
        '前提 撮影の前に登録し、2030年1月9日（水）の予定を作った職員の詳細を開いている',
        () => expect(page.getByTestId('staff-detail-menu')).toBeVisible(),
      )
      const dialog = page.getByTestId('staff-retire-dialog')
      await step(page, '「…」から「退職にする」を押す', async () => {
        await page.getByTestId('staff-detail-menu').click()
        await page.getByTestId('staff-detail-retire').click()
      })
      await check(
        page,
        '退職にできないことと残る予定が出て、「退職にする」を押せない',
        async () => {
          await expect(dialog).toContainText(`${name} を退職にできません`)
          await expect(
            dialog.getByTestId(`staff-retire-assignment-schedule-${scheduleId}`),
          ).toBeVisible()
          await expect(dialog.getByTestId('staff-retire-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
        },
      )
    })
  })

  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり、幅 390px）`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('staff-list-phone スマートフォンの幅で一覧を開いた場合、2 行のリストになり横にスクロールしないこと', async ({
      page,
    }) => {
      await page.goto('/staff')
      await expect(page.getByTestId('staff-list-table')).toBeVisible()
      await intro(
        page,
        'スマートフォンの幅では、一覧が名前と、チーム・役職・部署の 2 行のリストになる',
      )

      await check(page, '前提 幅 390px で職員の一覧を開いている', () =>
        expect(page.getByTestId('staff-list-table')).toBeVisible(),
      )
      await check(
        page,
        '行は 1 行目に名前、2 行目にチーム・役職・部署で、横にスクロールしない',
        () =>
          expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(PHONE_VIEWPORT.width),
      )
    })
  })

  test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('staff-forbidden 職員の管理の権限を持たない職員が職員の画面を開いた場合、権限が無い表示になること', async ({
      context,
      request,
    }) => {
      const id = await registerStaffId(request, await issueManagerToken(), newStaff('hidden'))

      const page = await context.newPage()
      await page.goto('/staff')
      await expect(page.getByTestId('page-forbidden')).toBeVisible()
      await intro(page, '職員の管理の権限を持たない職員には、職員の画面を出さない')

      for (const url of ['/staff', '/staff/new', `/staff/${id}`]) {
        await step(page, `${url} を開く`, async () => {
          await page.goto(url)
        })
        await check(
          page,
          '「この画面を開く権限がありません」が出て、ナビゲーションに「職員」が無い',
          async () => {
            await expect(page.getByTestId('page-forbidden')).toBeVisible()
            await expect(page.getByTestId('site-nav')).not.toContainText('職員')
          },
        )
      }
    })
  })
})
