import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { RECEIPT_CHECK, STAFF_MANAGE } from '#/api/types'

import { SiteNav, siteNavGroups, siteNavHrefOf } from './SiteNav'

const MANAGER_GROUPS = siteNavGroups({ ...FAKE_VIEWER, policyCodes: [STAFF_MANAGE, RECEIPT_CHECK] })

describe('SiteNav', () => {
  it('レールに出す名前は、どの権限の組み合わせでも 5 文字以内である', () => {
    const policyCodesList = [[STAFF_MANAGE, RECEIPT_CHECK], [STAFF_MANAGE], [RECEIPT_CHECK], []]
    const names = policyCodesList.flatMap((policyCodes) =>
      siteNavGroups({ ...FAKE_VIEWER, policyCodes })
        .flatMap((group) => group.items)
        .map((item) => item.railLabel ?? item.label),
    )
    // 名前は全て BMP の文字なので、length を文字数として数える
    expect(names.filter((name) => name.length > 5)).toEqual([])
  })

  it('レールでは部署とチームを短い名前の「所属」で出し、読み上げる名前に正式な名前を続ける', () => {
    render(<SiteNav current="/schedule" groups={MANAGER_GROUPS} isRail />)
    const link = screen.getByTestId('site-nav-organization')
    expect(within(link).getByText('所属')).toBeVisible()
    expect(link).toHaveAccessibleName('所属（部署とチーム）')
  })

  it('開いた形では部署とチームを正式な名前で出す', () => {
    render(<SiteNav current="/schedule" groups={MANAGER_GROUPS} />)
    const link = screen.getByTestId('site-nav-organization')
    expect(link.textContent).toBe('部署とチーム')
    expect(link).toHaveAccessibleName('部署とチーム')
  })
})

describe('siteNavHrefOf', () => {
  it.each([
    ['/patients/patient-1', '/patients'],
    ['/staff/new', '/staff'],
    ['/schedule/review', '/schedule/review'],
    ['/schedule/new', '/schedule'],
    ['/receipt/result', '/receipt'],
    ['/organization', '/organization'],
  ])('%s は、いちばん長く一致するナビゲーションの href の %s になる', (pathname, expected) => {
    expect(siteNavHrefOf(pathname)).toBe(expected)
  })

  it('ナビゲーションの href の下に無い pathname は、そのまま返す', () => {
    expect(siteNavHrefOf('/unknown')).toBe('/unknown')
  })

  it('href と途中まで同じ別の語の pathname は、その href を選ばない', () => {
    expect(siteNavHrefOf('/staffing')).toBe('/staffing')
  })
})
