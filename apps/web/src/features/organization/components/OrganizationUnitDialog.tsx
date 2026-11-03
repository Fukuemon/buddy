import { DotLabel, FormField, formFieldControlClassName, InputDialog } from '@buddy/ui'
import { useId, useRef, useState } from 'react'

import { TEAM_COLORS, type TeamColor } from '#/api/types'
import { TEAM_COLOR_LABELS, teamColorDotClassName } from '#/components/teamColor'

import { NAME_REQUIRED_MESSAGE, type UnitKind } from '../lib/errorMessage'

/** 部署とチームの名前の上限の文字数。予定の API の上限と同じにする。 */
const NAME_MAX_LENGTH = 255

/** ダイアログで送る値。color はチームのときだけ持つ。 */
export type OrganizationUnitValue = { name: string; color?: TeamColor }

export type OrganizationUnitDialogProps = {
  kind: UnitKind
  /** 作成なら create、編集なら edit。タイトルと主ボタンの文字が変わる。 */
  mode: 'create' | 'edit'
  /** 開いたときの名前と色。作成では空の名前と色の初期値を渡す。チームでは color を必ず渡す。 */
  initial: OrganizationUnitValue
  isSubmitting: boolean
  /** 作れなかったか、変えられなかったときの文。 */
  errorMessage?: string
  /** 名前の前後の空白を除いた値で呼ぶ。名前が空か空白だけなら呼ばずに、欄の下に誤りの文を出す。 */
  onSubmit: (value: OrganizationUnitValue) => void
  onClose: () => void
}

const TITLES: Record<UnitKind, Record<'create' | 'edit', string>> = {
  department: { create: '部署を作る', edit: '部署を編集' },
  team: { create: 'チームを作る', edit: 'チームを編集' },
}

/**
 * 部署かチームを作るか、変えるダイアログ。名前の欄と、チームではチームの色の 8 色のラジオボタンを置く。
 * 開くと名前の欄にフォーカスを置く。testid は `organization-list-<kind>-` を前に付ける。
 */
export const OrganizationUnitDialog = ({
  kind,
  mode,
  initial,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: OrganizationUnitDialogProps) => {
  const prefix = `organization-list-${kind}`
  const formId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  const [isNameMissing, setNameMissing] = useState(false)

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed === '') {
      setNameMissing(true)
      return
    }
    onSubmit(color === undefined ? { name: trimmed } : { name: trimmed, color })
  }

  return (
    <InputDialog
      initialFocusRef={nameRef}
      busyLabel={mode === 'create' ? '作っています' : '保存しています'}
      canSubmit
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: `${prefix}-submit-error` }
      }
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      submitLabel={mode === 'create' ? '作る' : '保存'}
      testIdPrefix={prefix}
      title={TITLES[kind][mode]}
    >
      <form
        className="flex flex-col gap-4"
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FormField
          error={isNameMissing ? NAME_REQUIRED_MESSAGE : undefined}
          errorTestId={`${prefix}-error-name`}
          label="名前"
        >
          {(field) => (
            <input
              {...field}
              className={formFieldControlClassName}
              data-testid={`${prefix}-name`}
              disabled={isSubmitting}
              maxLength={NAME_MAX_LENGTH}
              onChange={(event) => {
                setName(event.target.value)
                setNameMissing(false)
              }}
              ref={nameRef}
              value={name}
            />
          )}
        </FormField>
        {color !== undefined && (
          <FormField
            hint="職員の一覧とカレンダーで、チームの名前の前の点に使います。"
            isGroup
            label="色"
          >
            {(field) => (
              <div
                {...field}
                className="grid grid-cols-2 gap-2 desktop:grid-cols-4"
                data-testid={`${prefix}-color`}
                role="radiogroup"
              >
                {TEAM_COLORS.map((c) => (
                  <label
                    className="flex min-h-11 items-center gap-2 rounded-8 px-3 ring-1 ring-border ring-inset has-checked:ring-2 has-checked:ring-primary has-[:focus-visible]:focus-ring"
                    data-testid={`${prefix}-color-${c}`}
                    key={c}
                  >
                    <input
                      checked={color === c}
                      className="sr-only"
                      disabled={isSubmitting}
                      name={`${formId}-color`}
                      onChange={() => setColor(c)}
                      type="radio"
                      value={c}
                    />
                    <DotLabel dotClassName={teamColorDotClassName(c)}>
                      {TEAM_COLOR_LABELS[c]}
                    </DotLabel>
                  </label>
                ))}
              </div>
            )}
          </FormField>
        )}
      </form>
    </InputDialog>
  )
}
