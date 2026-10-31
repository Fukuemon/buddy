import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type RowTableProps = {
  /** 名前の列の見出しと、補足の値の列の見出し。状態の列の見出しは statusHeader で渡す。 */
  primaryHeader: string
  metaHeaders: readonly string[]
  statusHeader: string
  'data-testid'?: string
  children: ReactNode
}

const headClassName = 'px-4 py-2 text-left text-caption font-normal text-text-secondary'

/**
 * 行全体を押せる一覧の表。幅 768px 以上では表に、幅 768px 未満では 1 行目に名前と状態の印、
 * 2 行目に補足の値を「・」でつなげた 2 行のリストにする。行は RowTableRow で並べる。
 */
export const RowTable = ({
  primaryHeader,
  metaHeaders,
  statusHeader,
  'data-testid': testId,
  children,
}: RowTableProps) => (
  <table className="block w-full border-collapse desktop:table" data-testid={testId}>
    <thead className="hidden desktop:table-header-group">
      <tr className="border-b border-border">
        <th className={headClassName} scope="col">
          {primaryHeader}
        </th>
        {metaHeaders.map((header) => (
          <th className={headClassName} key={header} scope="col">
            {header}
          </th>
        ))}
        <th className={headClassName} scope="col">
          {statusHeader}
        </th>
        <th className="w-10" scope="col">
          <span className="sr-only">詳細</span>
        </th>
      </tr>
    </thead>
    <tbody className="block border-t border-border desktop:table-row-group desktop:border-0">
      {children}
    </tbody>
  </table>
)

export type RowTableRowProps = {
  /** 行を押すと移る先。名前をリンクにし、押せる領域を行全体に広げる。 */
  href: string
  name: string
  /** 名前の左に置く要素。頭文字の丸を置く。幅 768px 未満では出さない。 */
  leading?: ReactNode
  /** 名前の下に置く補足。幅 768px 未満では出さない。 */
  subtext?: ReactNode
  /** 補足の値と、その列の見出し。幅 768px 以上では列ごとに、未満では 2 行目に値を「・」でつなげて出す。 */
  meta: readonly { header: string; value: string }[]
  status: ReactNode
  'data-testid'?: string
}

const cellClassName = 'desktop:table-cell desktop:px-4 desktop:py-3 desktop:align-middle'

/** RowTable の 1 行。行のどこを押しても href へ移る。 */
export const RowTableRow = ({
  href,
  name,
  leading,
  subtext,
  meta,
  status,
  'data-testid': testId,
}: RowTableRowProps) => (
  <tr
    className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border px-1 py-3 hover:bg-surface-subtle has-[:focus-visible]:focus-ring desktop:table-row desktop:p-0"
    data-testid={testId}
  >
    <td className={clsx('min-w-0', cellClassName)}>
      <a
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 text-body font-bold whitespace-nowrap text-text outline-none after:absolute after:inset-0"
        href={href}
      >
        <span className="row-span-2 hidden desktop:block">{leading}</span>
        {name}
        {subtext !== undefined && (
          <span className="hidden truncate text-caption font-normal text-text-secondary desktop:block">
            {subtext}
          </span>
        )}
      </a>
    </td>
    {meta.map(({ header, value }) => (
      <td className={clsx('hidden text-body-dense', cellClassName)} key={header}>
        {value}
      </td>
    ))}
    <td className={clsx('justify-self-end', cellClassName)}>{status}</td>
    <td className="col-span-2 truncate text-caption text-text-secondary desktop:hidden">
      {meta.map(({ value }) => value).join('・')}
    </td>
    <td aria-hidden className={clsx('hidden text-right text-text-secondary', cellClassName)}>
      ›
    </td>
  </tr>
)
