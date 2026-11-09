import type { ReactNode } from 'react'

export type BusyLabelProps = {
  /** true の間は、文字の前に回転の印を出す。 */
  busy: boolean
  children: ReactNode
}

/**
 * ボタンの文字。送っている間は、文字を残したまま前に回転の印を出す。
 * Button の isLoading は文字を隠して印を重ねるので、文字を読ませたまま待たせるダイアログのボタンでは、これを子に渡す。
 */
export const BusyLabel = ({ busy, children }: BusyLabelProps) => (
  <span className="inline-flex items-center gap-2">
    {busy && (
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-text-disabled border-t-text-secondary"
      />
    )}
    {children}
  </span>
)
