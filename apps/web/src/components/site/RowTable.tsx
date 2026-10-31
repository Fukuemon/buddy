import { clsx } from 'clsx'
import { Fragment, type ReactNode } from 'react'

export type RowTableProps = {
  /** 名前の列の見出しと、補足の値の列の見出し。 */
  primaryHeader: string
  metaHeaders: readonly string[]
  /** 補足の値の右に足す列の見出し。足さないときは省く。 */
  asideHeader?: string
  'data-testid'?: string
  children: ReactNode
}

const headClassName = 'px-4 py-2 text-left text-caption font-normal text-text-secondary'

/**
 * 行全体を押せる一覧の表。幅 768px 以上では表に、幅 768px 未満では 1 行目に名前と足した列の値、
 * 2 行目に補足の値を「・」でつなげた 2 行のリストにする。行は RowTableRow で並べる。
 */
export const RowTable = ({
  primaryHeader,
  metaHeaders,
  asideHeader,
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
        {asideHeader !== undefined && (
          <th className={headClassName} scope="col">
            {asideHeader}
          </th>
        )}
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
  /** 補足の値と、その列の見出し。幅 768px 以上では列ごとに、未満では 2 行目に「・」でつなげて出す。 */
  meta: readonly { header: string; value: ReactNode }[]
  /** 足した列の値。幅 768px 未満では名前の右に出す。RowTable に asideHeader を渡したときだけ渡す。 */
  aside?: ReactNode
  'data-testid'?: string
}

const cellClassName = 'desktop:table-cell desktop:px-4 desktop:py-3 desktop:align-middle'

/** RowTable の 1 行。行のどこを押しても href へ移る。 */
export const RowTableRow = ({
  href,
  name,
  meta,
  aside,
  'data-testid': testId,
}: RowTableRowProps) => (
  <tr
    className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border px-1 py-3 hover:bg-surface-subtle has-[:focus-visible]:focus-ring desktop:table-row desktop:p-0"
    data-testid={testId}
  >
    <td className={clsx('min-w-0', cellClassName)}>
      <a
        className="block truncate text-body font-bold whitespace-nowrap text-text outline-none after:absolute after:inset-0"
        href={href}
      >
        {name}
      </a>
    </td>
    {meta.map(({ header, value }) => (
      <td className={clsx('hidden text-body-dense', cellClassName)} key={header}>
        {value}
      </td>
    ))}
    {aside !== undefined && (
      <td className={clsx('justify-self-end text-body-dense', cellClassName)}>{aside}</td>
    )}
    <td className="col-span-2 flex flex-wrap items-center text-caption text-text-secondary desktop:hidden">
      {meta.map(({ header, value }, index) => (
        <Fragment key={header}>
          {index > 0 && <span aria-hidden>・</span>}
          {value}
        </Fragment>
      ))}
    </td>
    <td aria-hidden className={clsx('hidden text-right text-text-secondary', cellClassName)}>
      ›
    </td>
  </tr>
)
