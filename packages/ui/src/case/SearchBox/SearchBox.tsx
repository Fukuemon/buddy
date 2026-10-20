import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef } from 'react'

import { SearchIcon } from '../../icons/SearchIcon'

export type SearchBoxProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'onChange'> & {
  onSearch: (value: string) => void
  isWide?: boolean
}

/** 検索語の入力。入力のたびに onSearch を呼ぶ。間引きは呼び出す側が行う。 */
export const SearchBox = ({
  onSearch,
  placeholder = '検索',
  isWide = true,
  ...props
}: SearchBoxProps) => (
  <label
    className={clsx(
      'grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 rounded-8 bg-surface px-4 py-3 text-body-dense ring-1 ring-border-field ring-inset',
      'has-[:focus-visible]:focus-ring',
      isWide && 'w-full',
    )}
  >
    <span className="grid size-6 place-items-center">
      <SearchIcon height={18} width={18} />
    </span>
    <input
      {...props}
      className="outline-none placeholder:text-text-secondary"
      onChange={(event) => onSearch(event.target.value)}
      placeholder={placeholder}
      type="search"
    />
  </label>
)
