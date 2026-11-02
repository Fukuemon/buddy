import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import { SiteNav, siteNavGroups } from './SiteNav'

const MANAGER_GROUPS = siteNavGroups({ canManageStaff: true, canCheckReceipt: true })

describe('SiteNav', () => {
  it('レールに出す名前は、どの権限の組み合わせでも 5 文字以内である', () => {
    const names = [true, false].flatMap((canManageStaff) =>
      [true, false].flatMap((canCheckReceipt) =>
        siteNavGroups({ canManageStaff, canCheckReceipt })
          .flatMap((group) => group.items)
          .map((item) => item.railLabel ?? item.label),
      ),
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
