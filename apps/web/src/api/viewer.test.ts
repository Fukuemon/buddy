import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vite-plus/test'

import { queryKeys } from './queryKeys'
import type { Viewer } from './types'
import { STAFF_MANAGE } from './permissions'
import { watchViewerPermissions } from './viewer'

const viewerWith = (policyCodes: readonly string[]): Viewer => ({
  staffId: 'staff-1',
  staffName: '青木 陽菜',
  facilityId: 'facility-1',
  policyCodes,
  schedulePolicies: [],
})

const setup = (initial: Viewer | null) => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(queryKeys.viewer(), initial)
  const onChange = vi.fn<() => void>()
  const unsubscribe = watchViewerPermissions(queryClient, onChange)
  return { queryClient, onChange, unsubscribe }
}

describe('watchViewerPermissions', () => {
  it('取り直した Viewer の権限の code の一覧が変わったときに、onChange を呼ぶ', () => {
    const { queryClient, onChange } = setup(viewerWith([]))
    queryClient.setQueryData(queryKeys.viewer(), viewerWith([STAFF_MANAGE]))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('権限の code の一覧が同じなら、名前が変わっても onChange を呼ばない', () => {
    const { queryClient, onChange } = setup(viewerWith([STAFF_MANAGE]))
    queryClient.setQueryData(queryKeys.viewer(), {
      ...viewerWith([STAFF_MANAGE]),
      staffName: '青木 陽菜（変更後）',
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Viewer 以外の query が変わっても、onChange を呼ばない', () => {
    const { queryClient, onChange } = setup(viewerWith([]))
    queryClient.setQueryData(['staff', 'list'], [])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('購読をやめた後は、権限が変わっても onChange を呼ばない', () => {
    const { queryClient, onChange, unsubscribe } = setup(viewerWith([]))
    unsubscribe()
    queryClient.setQueryData(queryKeys.viewer(), viewerWith([STAFF_MANAGE]))
    expect(onChange).not.toHaveBeenCalled()
  })
})
