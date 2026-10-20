export type LoadingProps = {
  description?: string
}

/** 読み込み中の表示。description を渡すと、インジケーターの下に文を出す。 */
export const Loading = ({ description }: LoadingProps) => (
  <output
    aria-live="polite"
    className="flex h-full min-h-40 flex-col items-center justify-center gap-5 bg-gray-0/80"
  >
    <div className="size-12 animate-spin rounded-full border-6 border-gray-100 border-t-action-main" />
    {description !== undefined && (
      <div className="text-xl font-bold text-action-main">{description}</div>
    )}
  </output>
)
