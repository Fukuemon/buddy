import type { ReactNode } from 'react'

import { hasPermission, type Permission } from '#/api/permissions'
import { useViewer } from '#/api/viewer'

export type PermissionGuardProps = {
  /** children を出すのに要る権限。route の requirePermission と同じキーを渡す。 */
  permission: Permission
  /** 権限が無いときに出すもの。デフォルトは何も出さない。 */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * 画面の中のボタンとダイアログを、ログインした職員の権限で出し分ける。
 * 職員は query から読むので、権限を変えて Viewer を取り直すと、画面を読み直さずに出し分けが変わる。
 * 画面の出し分けだけで、拒むのは API である（ADR-0017）。
 */
export const PermissionGuard = ({ permission, fallback = null, children }: PermissionGuardProps) =>
  hasPermission(useViewer(), permission) ? children : fallback
