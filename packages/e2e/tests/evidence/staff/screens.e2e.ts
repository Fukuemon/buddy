import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
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
import { signInAtBroker } from '../../screens/login'

/** 休職と退職の確認に残る予定の日。今日より後にする。 */
const FUTURE_DATE = '2030-01-09'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーでログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/staff')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** マネージャーでログインし、撮影の前に職員を 1 人登録して、その ID と名前を返す。 */
const prepareStaff = (label: string) => async (page: Page) => {
  await signInManager(page)
  const staff = newStaff(label)
  const id = await registerStaffId(page.request, await issueManagerToken(page.request), staff)
  return { id, name: staff.name }
}

/** prepareStaff に足して、その職員に今日より後の予定を 1 件作る。 */
const prepareStaffWithSchedule = (label: string) => async (page: Page) => {
  const staff = await prepareStaff(label)(page)
  const res = await createNormalSchedule(
    page.request,
    await issueManagerToken(page.request),
    STAFF_FORM.facilityId,
    { staffId: staff.id, title: `見本の会議 ${Date.now()}`, date: FUTURE_DATE },
  )
  const scheduleId = ((await res.json()) as { id: string }).id
  return { ...staff, scheduleId }
}

test.describe('職員の管理', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員を登録した場合、詳細へ移り、役職に決まっている権限が付くこと`, async ({
      browser,
    }) => {
      const staff = newStaff('evidence')
      await recordPrEvidence(
        browser,
        {
          name: 'staff-register',
          title: 'メールアドレスと役職で職員を登録すると、詳細へ移り、役職に決まっている権限が付く',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await signInManager(page)
          const member = (
            await listPositions(page.request, await issueManagerToken(page.request))
          ).find((p) => p.id === STAFF_FORM.positionId)
          return { member }
        },
        async ({ page, step, check }, { member }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-table')).toBeVisible()
          await step('職員の一覧を開いている')

          await step('「職員を登録」を押し、名前、メールアドレス、役職「メンバー」を入れて登録する')
          await page.getByTestId('staff-list-new').click()
          const dialog = page.getByTestId('staff-new-dialog')
          await dialog.getByTestId('staff-new-name').fill(staff.name)
          await dialog.getByTestId('staff-new-email').fill(staff.email)
          await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
          await dialog.getByTestId('staff-new-submit').click()

          await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
          await check('登録した職員の詳細へ移る')

          await page.getByTestId('staff-detail-tab-policies').click()
          const group = page.getByTestId('staff-policy-group-position')
          await expect(group).toContainText(`役職「${member?.name}」で付く権限`)
          for (const { code } of member?.policies ?? []) {
            await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
          }
          await check(
            `権限のタブの「役職「${member?.name}」で付く権限」に、役職に決まっている権限が並ぶ`,
          )
        },
      )
    })

    test(`${prefix}一覧を開いた場合、有効の職員がチームの順に並び、休職で絞り込むと戻る予定の日が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-list-filter',
          title: '一覧は有効の職員だけをチームの順に出し、休職で絞り込むと戻る予定の日の列が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await signInManager(page)
          const token = await issueManagerToken(page.request)
          const id = await registerStaffId(page.request, token, newStaff('on-leave'))
          await leaveStaff(page.request, token, id)
          return { id }
        },
        async ({ page, step, check }, { id }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-filter-status')).toHaveValue('active')
          await expect(page.getByTestId(`staff-list-row-${id}`)).toHaveCount(0)
          await check('開いた直後は状態が「有効」で、有効の職員だけがチームの順、名前の順に並ぶ')

          await step('状態の絞り込みを「休職」にする')
          await page.getByTestId('staff-list-filter-status').selectOption('on_leave')
          await expect(page.getByTestId(`staff-list-leave-return-${id}`)).toHaveText(
            '戻る予定の日なし',
          )
          await check('休職の職員だけが並び、「戻る予定の日」の列が出る')
        },
      )
    })

    test(`${prefix}スマートフォンの幅で一覧を開いた場合、2 行のリストになり横にスクロールしないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-list-phone',
          title: 'スマートフォンの幅では、一覧が名前と、チーム・役職・部署の 2 行のリストになる',
          actor: MANAGER,
          variant,
          viewport: PHONE_VIEWPORT,
        },
        signInManager,
        async ({ page, step, check }) => {
          await page.goto('/staff')
          await expect(page.getByTestId('staff-list-table')).toBeVisible()
          await step('幅 390px で職員の一覧を開いている')

          await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(PHONE_VIEWPORT.width)
          await check('行は 1 行目に名前、2 行目にチーム・役職・部署で、横にスクロールしない')
        },
      )
    })

    test(`${prefix}職員のプロフィールを編集した場合、詳細と一覧に変えた値が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-edit-profile',
          title: '名前、電話番号、部署、チームを変えると、詳細と一覧に変えた値が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          const staff = await prepareStaff('edit')(page)
          const token = await issueManagerToken(page.request)
          const team = (await listUnits(page.request, token, 'teams')).find(
            (t) => t.id !== STAFF_FORM.teamId,
          )
          const department = (await listUnits(page.request, token, 'departments'))[0]
          return { ...staff, team, department }
        },
        async ({ page, step, check }, { id, name, team, department }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-name')).toHaveText(name)
          await step('撮影の前に登録した職員の詳細を開いている')

          await step('「編集」を押し、名前、電話番号、部署、チームを変えて保存する')
          await page.getByTestId('staff-detail-edit').click()
          const dialog = page.getByTestId('staff-detail-edit-dialog')
          await dialog.getByTestId('staff-detail-name-input').fill(`${name} 改`)
          await dialog.getByTestId('staff-detail-phone-input').fill('09012345678')
          await dialog.getByTestId('staff-detail-department-input').selectOption(department.id)
          await dialog.getByTestId('staff-detail-team-input').selectOption(team?.id ?? '')
          await dialog.getByTestId('staff-detail-save').click()

          await expect(page.getByTestId('staff-detail-name')).toHaveText(`${name} 改`)
          await expect(page.getByTestId('staff-detail-profile')).toContainText('09012345678')
          await expect(page.getByTestId('staff-detail-profile')).toContainText(team?.name ?? '')
          await check('詳細の名前とプロフィールに、変えた値が出る')

          await page.goto('/staff')
          await page.getByTestId('staff-list-search').fill(`${name} 改`)
          await expect(page.getByTestId(`staff-list-row-${id}`)).toContainText(team?.name ?? '')
          await check('一覧の行にも、変えた名前とチームが出る')
        },
      )
    })

    test(`${prefix}職員の役職を変えた場合、役職で付く権限が新しい役職のものになること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-change-position',
          title: '役職を変えると、「役職「…」で付く権限」が新しい役職のものになる',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          const staff = await prepareStaff('position')(page)
          const other = (
            await listPositions(page.request, await issueManagerToken(page.request))
          ).find(
            (p) =>
              p.id !== STAFF_FORM.positionId && !p.policies.some((q) => q.code === 'staff.manage'),
          )
          return { ...staff, other }
        },
        async ({ page, step, check }, { id, other }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-position-name')).toBeVisible()
          await step('撮影の前に登録した、役職がメンバーの職員の詳細を開いている')

          await step(`「役職を変える」を押し、「${other?.name}」に変える`)
          await page.getByTestId('staff-detail-position-change').click()
          const dialog = page.getByTestId('staff-position-dialog')
          await dialog.getByTestId(`staff-position-option-${other?.id}`).check()
          await dialog.getByTestId('staff-position-submit').click()
          await expect(page.getByTestId('staff-detail-position-name')).toHaveText(other?.name ?? '')

          await page.getByTestId('staff-detail-tab-policies').click()
          const group = page.getByTestId('staff-policy-group-position')
          await expect(group).toContainText(`役職「${other?.name}」で付く権限`)
          for (const { code } of other?.policies ?? []) {
            await expect(group.getByTestId(`staff-policy-row-${code}`)).toBeVisible()
          }
          await check(`権限のタブの「役職「${other?.name}」で付く権限」が、新しい役職の権限になる`)
        },
      )
    })

    test(`${prefix}権限を変えるでほかの権限を足した場合、個別に足した権限に入ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-add-policy',
          title: '権限を変えるでほかの権限を足すと、「個別に足した権限」に入る',
          actor: MANAGER,
          variant,
        },
        prepareStaff('policy'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await page.getByTestId('staff-detail-tab-policies').click()
          await expect(page.getByTestId('staff-policy-list')).toBeVisible()
          await step('撮影の前に登録した職員の詳細の、権限のタブを開いている')

          await step(
            '「権限を変える」を押し、ほかの権限の「事業所の全ての予定の閲覧」に入れて保存する',
          )
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await dialog.getByTestId('staff-policies-option-schedule.all.read').check()
          await dialog.getByTestId('staff-policies-submit').click()
          await expect(dialog).toHaveCount(0)

          await expect(
            page
              .getByTestId('staff-policy-group-individual')
              .getByTestId('staff-policy-row-schedule.all.read'),
          ).toBeVisible()
          await check('「個別に足した権限」に「事業所の全ての予定の閲覧」が入る')
        },
      )
    })

    test(`${prefix}権限を変えるで職員の候補に Tab で移った場合、候補にフォーカスの表示が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-policy-target-focus',
          title:
            '権限を変えるで職員の候補に Tab で移ると、候補に focus-ring のフォーカスの表示が出る',
          actor: MANAGER,
          variant,
        },
        prepareStaff('focus'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await dialog.getByTestId('staff-policies-option-schedule.user.read').check()
          await step('「権限を変える」で、「指定した職員の予定の閲覧」に入れている')

          await step('「＋ 職員を選ぶ」を押して候補を開き、Tab で最初の候補に移る')
          await dialog.getByTestId('staff-policies-target-add').click()
          await expect(dialog.getByTestId('staff-policies-target-options')).toBeVisible()
          await page.keyboard.press('Tab')
          const first = dialog.getByTestId(/^staff-policies-target-option-/).first()
          await expect(first).toBeFocused()
          await check('最初の候補にフォーカスの表示が出る')
        },
      )
    })

    test(`${prefix}権限を変えるで職員の名前を入れてキーボードで足し、× で外した場合、チップが増えて減り、フォーカスが足す欄に戻ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-policy-target-keyboard',
          title:
            '権限を変えるで、職員の名前で絞った候補を ↓ と Enter で足し、× で外し、Escape で候補だけを閉じる',
          actor: MANAGER,
          variant,
        },
        prepareStaff('chip'),
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await page.getByTestId('staff-detail-tab-policies').click()
          await page.getByTestId('staff-detail-policies-change').click()
          const dialog = page.getByTestId('staff-policies-dialog')
          await dialog.getByTestId('staff-policies-option-schedule.user.read').check()
          const add = dialog.getByTestId('staff-policies-target-add')
          await expect(add).toBeVisible()
          await step('「権限を変える」で、「指定した職員の予定の閲覧」に入れている')

          await step(`「＋ 職員を選ぶ」に「${LEADER.staff.name}」と入れ、↓ で候補に移る`)
          await add.fill(LEADER.staff.name)
          await page.keyboard.press('ArrowDown')
          await expect(
            dialog.getByTestId(`staff-policies-target-option-${LEADER.staff.id}`),
          ).toBeFocused()
          await check(`候補が「${LEADER.staff.name}」に絞られ、その候補にフォーカスの表示が出る`)

          await step('Enter で足す')
          await page.keyboard.press('Enter')
          const chip = dialog.getByTestId(`staff-policies-target-${LEADER.staff.id}`)
          await expect(chip).toBeVisible()
          await expect(add).toBeFocused()
          await check('選んだ職員がチップで並び、フォーカスが足す欄に戻る')

          await step('チップの × を押して外す')
          await dialog.getByTestId(`staff-policies-target-remove-${LEADER.staff.id}`).click()
          await expect(chip).toHaveCount(0)
          await expect(add).toBeFocused()
          await check('チップが消え、フォーカスが足す欄に戻る')

          await step('もう一度候補を開き、Escape キーを押す')
          await add.click()
          await expect(dialog.getByTestId('staff-policies-target-options')).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(dialog.getByTestId('staff-policies-target-options')).toHaveCount(0)
          await expect(dialog).toBeVisible()
          await check('候補だけが閉じ、権限を変えるのダイアログは開いたままである')
        },
      )
    })

    test(`${prefix}職員を休職にした場合、今日以降の予定が出て、状態が休職になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-leave',
          title: '休職にすると、今日以降の予定が一覧で出て、確定すると状態が休職になる',
          actor: MANAGER,
          variant,
        },
        prepareStaffWithSchedule('leave'),
        async ({ page, step, check }, { id, scheduleId }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録し、2030年1月9日（水）の予定を作った職員の詳細を開いている')

          await step('「…」から「休職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-leave').click()
          const dialog = page.getByTestId('staff-leave-dialog')
          await expect(
            dialog.getByTestId(`staff-leave-assignment-schedule-${scheduleId}`),
          ).toContainText('2030年1月9日（水）')
          await check('確認のダイアログに、今日以降に残る予定が出る')

          await step('「休職にする」を押して確定する')
          await dialog.getByTestId('staff-leave-submit').click()
          await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
          await check('状態の印が「休職」になる')
        },
      )
    })

    test(`${prefix}休職の職員を復職にした場合、有効に戻ること`, async ({ browser }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-reinstate',
          title: '休職の職員を復職にすると、休職の印が消えて有効に戻る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          const staff = await prepareStaff('reinstate')(page)
          await leaveStaff(page.request, await issueManagerToken(page.request), staff.id)
          return staff
        },
        async ({ page, step, check }, { id }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
          await step('撮影の前に休職にした職員の詳細を開いている')

          await step('「…」から「復職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-reinstate').click()
          await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
          await expect(page.getByTestId('staff-detail-status-text')).toHaveCount(0)
          await check('休職の印と在籍の文が消え、有効に戻る')
        },
      )
    })

    test(`${prefix}予定が残る職員を退職にしようとした場合、退職を確定できないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-retire-refused',
          title: '予定が残る職員を退職にしようとすると、残る予定が出て、退職にするを押せない',
          actor: MANAGER,
          variant,
        },
        prepareStaffWithSchedule('retire'),
        async ({ page, step, check }, { id, name, scheduleId }) => {
          await page.goto(`/staff/${id}`)
          await expect(page.getByTestId('staff-detail-menu')).toBeVisible()
          await step('撮影の前に登録し、2030年1月9日（水）の予定を作った職員の詳細を開いている')

          await step('「…」から「退職にする」を押す')
          await page.getByTestId('staff-detail-menu').click()
          await page.getByTestId('staff-detail-retire').click()
          const dialog = page.getByTestId('staff-retire-dialog')
          await expect(dialog).toContainText(`${name} を退職にできません`)
          await expect(
            dialog.getByTestId(`staff-retire-assignment-schedule-${scheduleId}`),
          ).toBeVisible()
          await expect(dialog.getByTestId('staff-retire-submit')).toHaveAttribute(
            'aria-disabled',
            'true',
          )
          await check('退職にできないことと残る予定が出て、「退職にする」を押せない')
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が職員の画面を開いた場合、権限が無い表示になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-forbidden',
          title: '職員の管理の権限を持たない職員には、職員の画面を出さない',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          const id = await registerStaffId(
            page.request,
            await issueManagerToken(page.request),
            newStaff('hidden'),
          )
          await page.goto('/staff')
          await signInAtBroker(page, LEADER.email)
          return { id }
        },
        async ({ page, step, check }, { id }) => {
          for (const url of ['/staff', '/staff/new', `/staff/${id}`]) {
            await step(`${url} を開く`)
            await page.goto(url)
            await expect(page.getByTestId('page-forbidden')).toBeVisible()
            await expect(page.getByTestId('site-nav')).not.toContainText('職員')
            await check('「この画面を開く権限がありません」が出て、ナビゲーションに「職員」が無い')
          }
        },
      )
    })
  }
})
