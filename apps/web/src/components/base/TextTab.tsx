import { clsx } from 'clsx'

export type TextTabItem<Id extends string> = {
  id: Id
  label: string
}

export type TextTabProps<Id extends string> = {
  tabs: readonly TextTabItem<Id>[]
  activeTabId: Id
  onTabChange: (tabId: Id) => void
  variant?: 'default' | 'white'
  'data-testid'?: string
}

/** 文字のタブ。選択の状態は持たず、activeTabId と onTabChange で親が持つ。 */
export const TextTab = <Id extends string>({
  tabs,
  activeTabId,
  onTabChange,
  variant = 'default',
  'data-testid': testId,
}: TextTabProps<Id>) => {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTabId),
  )

  return (
    <div
      className={clsx(
        'relative flex h-12 w-full gap-1 overflow-hidden rounded-xl border p-0.5',
        variant === 'white' ? 'border-gray-0 bg-gray-0' : 'border-gray-100 bg-gray-10',
      )}
      data-testid={testId}
      role="tablist"
    >
      <div
        aria-hidden
        className={clsx(
          'absolute top-0.5 h-[42px] rounded-[10px] shadow-[0_1px_2px_0_rgb(0_0_0/4%)] transition-transform duration-200',
          variant === 'white' ? 'bg-gray-10' : 'bg-gray-0',
        )}
        style={{
          width: `calc(${100 / tabs.length}% - 1px)`,
          transform: `translateX(${100 * activeIndex}%)`,
        }}
      />
      {tabs.map((tab) => (
        <button
          aria-selected={tab.id === activeTabId}
          className={clsx(
            'relative flex flex-1 cursor-pointer items-center justify-center text-[15px] font-bold transition-colors',
            tab.id === activeTabId ? 'text-gray-1000' : 'text-gray-400',
          )}
          data-testid={testId === undefined ? undefined : `${testId}-${tab.id}`}
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
