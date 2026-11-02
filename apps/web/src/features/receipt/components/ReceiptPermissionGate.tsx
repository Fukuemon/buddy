import { useRouteContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'

/**
 * 照合の権限を持つ職員にだけ children を出し、持たない職員には権限が無いことを示す。
 * 画面の出し分けだけで、照合を拒むのは照合の API である（ADR-0022）。
 */
export const ReceiptPermissionGate = ({ children }: { children: ReactNode }) => {
  const { viewer } = useRouteContext({ from: '__root__' })
  return viewer?.canCheckReceipt ? children : <PageForbiddenMessage policyName="照合" />
}
