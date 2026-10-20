import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef } from 'react'

import SearchIcon from '#/assets/icons/search.svg?react'

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
      'grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 rounded-[14px] bg-gray-0 px-4 py-3 text-base shadow-[0_1px_2px_0_#e5e5e8] ring-1 ring-gray-200 ring-inset',
      'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action-main',
      isWide && 'w-full',
    )}
  >
    <span className="grid size-6 place-items-center">
      <SearchIcon height={18} width={18} />
    </span>
    <input
      {...props}
      className="outline-none placeholder:text-gray-500"
      onChange={(event) => onSearch(event.target.value)}
      placeholder={placeholder}
      type="search"
    />
  </label>
)
