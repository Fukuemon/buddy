import ImportIcon from '#/assets/icons/download.svg?react'
import ReviewIcon from '#/assets/icons/notifications.svg?react'
import { IMPORT_NAV_ITEM, REVIEW_NAV_ITEM } from '#/components/site/SiteNav'

export type CalendarHeaderToolsProps = {
  /** 確認が必要な予定の件数。0 か読み終える前は、件数の印を出さない。 */
  reviewCount: number | undefined
}

const buttonClassName =
  'relative grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-subtle focus-visible:focus-ring'

/** ヘッダーの右の、予定の取り込みと確認が必要な予定のボタン。確認が必要な予定は、件数を赤い丸の印で示す。 */
export const CalendarHeaderTools = ({ reviewCount }: CalendarHeaderToolsProps) => {
  const hasReview = reviewCount !== undefined && reviewCount > 0
  return (
    <>
      <a
        aria-label={IMPORT_NAV_ITEM.label}
        className={buttonClassName}
        data-testid={`site-nav-${IMPORT_NAV_ITEM.id}`}
        href={IMPORT_NAV_ITEM.href}
      >
        <ImportIcon aria-hidden="true" height={24} width={24} />
      </a>
      <a
        aria-label={
          hasReview ? `${REVIEW_NAV_ITEM.label} ${reviewCount} 件` : REVIEW_NAV_ITEM.label
        }
        className={buttonClassName}
        data-testid={`site-nav-${REVIEW_NAV_ITEM.id}`}
        href={REVIEW_NAV_ITEM.href}
      >
        <ReviewIcon aria-hidden="true" height={24} width={24} />
        {hasReview && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-caption font-bold text-text-inverse"
            data-testid="site-nav-review-count"
          >
            {reviewCount > 99 ? '99+' : reviewCount}
          </span>
        )}
      </a>
    </>
  )
}
