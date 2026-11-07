import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type RowTableProps = {
  /** 名前の列の見出しと、補足の値の列の見出し。 */
  primaryHeader: string
  metaHeaders: readonly string[]
  /** 状態の印の列の見出し。状態の印を出さない一覧では省く。 */
  statusHeader?: string
  /** 右端の列の、読み上げだけの見出し。行を押して詳細へ移る一覧は「詳細」、行の操作を置く一覧は「操作」にする。 */
  trailingHeader?: string
  'data-testid'?: string
  children: ReactNode
}

const headClassName = 'px-4 py-2 text-left text-caption font-bold text-text-secondary'

/**
 * 一覧の表。行は RowTableRow で並べる。
 * 幅 768px 以上では表にし、幅 768px 未満では、1 行目に名前と状態の印（か行の操作）、2 行目に補足の値を「・」でつなげた 2 行のリストにする。
 * 横にスクロールさせない。
 */
export const RowTable = ({
  primaryHeader,
  metaHeaders,
  statusHeader,
  trailingHeader = '詳細',
  'data-testid': testId,
  children,
}: RowTableProps) => (
  <table className="block w-full border-collapse desktop:table" data-testid={testId}>
    <thead className="hidden desktop:table-header-group">
      <tr className="border-b border-border-strong">
        <th className={headClassName} scope="col">
          {primaryHeader}
        </th>
        {metaHeaders.map((header) => (
          <th className={headClassName} key={header} scope="col">
            {header}
          </th>
        ))}
        {statusHeader !== undefined && (
          <th className={headClassName} scope="col">
            {statusHeader}
          </th>
        )}
        <th className="w-10" scope="col">
          <span className="sr-only">{trailingHeader}</span>
        </th>
      </tr>
    </thead>
    <tbody className="block border-t border-border desktop:table-row-group desktop:border-0">
      {children}
    </tbody>
  </table>
)

/** 補足の値の 1 列。 */
export type RowTableMeta = {
  header: string
  /** 値。null なら、見える値を出さず、読み上げだけで emptyLabel を伝える。幅 768px 未満の 2 行目にも出さない。 */
  value: ReactNode | null
  /** value が null のときに読み上げる文（「まだ取り込んでいません」）。testid を付けるときは要素で渡す。 */
  emptyLabel?: ReactNode
  /** true なら、幅 768px 未満の 2 行目に出さない。長い文の列に使う。 */
  isDesktopOnly?: boolean
  /** true なら、折り返さない。名前と日時に使う。 */
  isNoWrap?: boolean
}

type RowTableRowBase = {
  name: ReactNode
  /** 名前の左に置く要素。頭文字の丸を置く。幅 768px 未満では出さない。 */
  leading?: ReactNode
  /** 名前の下に置く補足。幅 768px 未満では出さない。 */
  subtext?: ReactNode
  meta: readonly RowTableMeta[]
  /** 状態の印。RowTable に statusHeader を渡したときだけ渡す。 */
  status?: ReactNode
  'data-testid'?: string
}

/**
 * 行の押し方。href は行のどこを押してもその先へ移り、onSelect は行のどこを押しても呼ぶ。
 * action は、詳細の無い一覧で行の右端に置く操作（ボタン 1 つか「…」のメニュー）で、行そのものは押せない。
 */
export type RowTableRowProps = RowTableRowBase &
  (
    | { href: string; onSelect?: never; action?: never }
    | { onSelect: () => void; href?: never; action?: never }
    | { action: ReactNode; href?: never; onSelect?: never }
  )

const cellClassName = 'desktop:table-cell desktop:px-4 desktop:py-3 desktop:align-middle'

/** RowTable の 1 行。 */
export const RowTableRow = (props: RowTableRowProps) => {
  const { name, leading, subtext, meta, status, 'data-testid': testId } = props
  const isPressable = props.action === undefined
  const nameContent = (
    <>
      {leading !== undefined && <span className="row-span-2 hidden desktop:block">{leading}</span>}
      <span className="min-w-0 truncate desktop:overflow-visible">{name}</span>
      {subtext !== undefined && (
        <span className="hidden truncate text-caption font-normal text-text-secondary desktop:block">
          {subtext}
        </span>
      )}
    </>
  )
  const nameClassName = clsx(
    'grid min-w-0 items-center gap-x-3 text-left text-body font-bold whitespace-nowrap text-text',
    leading !== undefined && 'desktop:grid-cols-[auto_minmax(0,1fr)]',
    // 押せる領域を行全体に広げる
    isPressable && 'outline-none after:absolute after:inset-0',
  )
  const firstSecondLineIndex = meta.findIndex(
    ({ value, isDesktopOnly }) => value !== null && !isDesktopOnly,
  )

  return (
    <tr
      className={clsx(
        'relative flex flex-wrap items-center gap-y-0.5 border-b border-border py-3 pl-3 desktop:table-row desktop:p-0',
        isPressable
          ? 'cursor-pointer pr-10 hover:bg-surface-subtle has-[:focus-visible]:focus-ring'
          : 'pr-3',
      )}
      data-testid={testId}
    >
      <td className={clsx('order-1 mr-2 min-w-0 flex-1', cellClassName)}>
        {props.href !== undefined ? (
          <a className={nameClassName} href={props.href}>
            {nameContent}
          </a>
        ) : props.onSelect !== undefined ? (
          <button className={nameClassName} onClick={props.onSelect} type="button">
            {nameContent}
          </button>
        ) : (
          <span className={nameClassName}>{nameContent}</span>
        )}
      </td>
      {/* 幅 768px 未満で、補足の値を 2 行目へ折り返す */}
      <td aria-hidden className="order-3 h-0 basis-full p-0 desktop:hidden" />
      {meta.map(({ header, value, emptyLabel, isDesktopOnly = false, isNoWrap = false }, index) => {
        const isOnSecondLine = value !== null && !isDesktopOnly
        const hasSeparator = isOnSecondLine && index > firstSecondLineIndex
        return (
          <td
            className={clsx(
              'order-4 text-caption text-text-secondary desktop:text-body-dense desktop:text-text',
              isOnSecondLine ? 'inline' : 'hidden',
              isNoWrap && 'whitespace-nowrap',
              hasSeparator && "before:content-['・'] desktop:before:content-none",
              cellClassName,
            )}
            key={header}
          >
            {value ?? <span className="sr-only">{emptyLabel}</span>}
          </td>
        )
      })}
      {status !== undefined && (
        <td className={clsx('order-2 justify-self-end', cellClassName)}>{status}</td>
      )}
      {props.action !== undefined ? (
        <td className={clsx('order-2 text-right whitespace-nowrap', cellClassName)}>
          {props.action}
        </td>
      ) : (
        <td
          aria-hidden
          className={clsx(
            'absolute top-1/2 right-3 -translate-y-1/2 text-right text-text-secondary desktop:static desktop:translate-y-0',
            cellClassName,
          )}
        >
          ›
        </td>
      )}
    </tr>
  )
}
