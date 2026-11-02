import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef, KeyboardEvent } from 'react'

import { fieldBoxClassName } from '../../base/FieldFrame/fieldClassName'
import { SearchIcon } from '../../icons/SearchIcon'

export type SearchBoxProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'onChange' | 'aria-label'
> & {
  /** 入力欄の名前。見えるラベルを持たないので必須にする。 */
  'aria-label': string
  /** 入力のたびと、Escape で語を消したときに呼ぶ。 */
  onSearch: (value: string) => void
  isWide?: boolean
}

/** 検索語の入力。入力のたびに onSearch を呼ぶ。間引きは呼び出す側が行う。Escape で語を消す。 */
export const SearchBox = ({
  onSearch,
  onKeyDown,
  placeholder = '検索',
  isWide = true,
  ...props
}: SearchBoxProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.key !== 'Escape' || event.currentTarget.value === '') return
    // ブラウザによっては type="search" の Escape で語を消さないので、自分で消す
    event.preventDefault()
    event.currentTarget.value = ''
    onSearch('')
  }

  return (
    <label
      className={clsx(
        'grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-2 px-4 py-3 text-body-dense',
        fieldBoxClassName,
        isWide && 'w-full',
      )}
    >
      <span className="grid size-6 place-items-center text-text-secondary">
        <SearchIcon height={18} width={18} />
      </span>
      <input
        {...props}
        className="min-w-0 bg-transparent outline-none placeholder:text-text-secondary disabled:text-text-disabled"
        onChange={(event) => onSearch(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        type="search"
      />
    </label>
  )
}
