import { SCHEDULE_KINDS, type ScheduleKind } from '#/api/types'
import { Button, Modal, SegmentedControl } from '@buddy/ui'
import type { ReactNode } from 'react'

import { SCHEDULE_KIND_LABEL } from '../constants/scheduleLabels'
import { ScheduleForm, type ScheduleFormProps } from './ScheduleForm'

const KIND_OPTIONS = SCHEDULE_KINDS.map((kind) => ({ id: kind, label: SCHEDULE_KIND_LABEL[kind] }))

export type ScheduleFormModalProps = Omit<ScheduleFormProps, 'id'> & {
  title: string
  submitLabel: string
  /** 送信のボタンの data-testid。作成と編集で分ける。 */
  submitTestId: string
  /** 「キャンセル」のボタンの data-testid。作成と編集で分ける。 */
  cancelTestId: string
  /** 渡したときだけ、通常と訪問を切り替える SegmentedControl を出す。 */
  onKindChange?: (kind: ScheduleKind) => void
  /** 送信に失敗したときの文。 */
  submitError?: string
  /** フォームの上に出す知らせ（Google カレンダーの最新の予定など）。 */
  notice?: ReactNode
  /** 渡したときだけ、フォームの上に変更の範囲（この回だけか、この日以降の全ての回か）を出す。予定の編集の繰り返しの予定の回で使う。 */
  scope?: ScheduleEditScopeProps
  onClose: () => void
}

/** 予定の編集の変更の範囲。following では、予定のフォームの代わりに following.body を出し、送信のボタンで following.formId のフォームを送る。 */
export type ScheduleEditScopeProps = {
  value: ScheduleEditScope
  onChange: (scope: ScheduleEditScope) => void
  following: {
    body: ReactNode
    formId: string
    isSubmitting: boolean
    isDirty: boolean
    /** false なら、送信のボタンを押せなくする。今日より前の回で、繰り返しを変えられないときに使う。 */
    canSubmit: boolean
  }
}

/** 予定の編集で変える範囲。occurrence は開いた回だけ、following は開いた回の日以降の全ての回の繰り返しである。 */
export type ScheduleEditScope = 'occurrence' | 'following'

const SCOPE_OPTIONS = [
  { id: 'occurrence', label: 'この回だけ' },
  { id: 'following', label: 'この日以降の全ての回' },
] as const satisfies readonly { id: ScheduleEditScope; label: string }[]

const FORM_ID = 'schedule-form'

/**
 * 予定のフォームをモーダルで出す。モーダルの下端の右に、「キャンセル」と送信のボタンをこの順に置く。
 * 右上に閉じるボタン（×）を置かない。「キャンセル」は、覆いと Escape キーと同じく、入力を変えていれば破棄するかを確認してから閉じる。
 * scope を渡すと、フォームの上に変更の範囲を出す。「この日以降の全ての回」の間は、予定の種類のタブを出さず、予定のフォームの代わりに scope.following.body を出す。
 * 予定のフォームを隠しても、入れた値は form に残す。
 */
export const ScheduleFormModal = ({
  title,
  submitLabel,
  submitTestId,
  cancelTestId,
  onKindChange,
  submitError,
  notice,
  scope,
  onClose,
  form,
  ...formProps
}: ScheduleFormModalProps) => {
  const kind = form.watch('kind')
  const following = scope?.value === 'following' ? scope.following : undefined

  return (
    <Modal
      data-testid="schedule-form-modal"
      headerContent={
        onKindChange === undefined || following !== undefined ? undefined : (
          <div className="w-60 max-w-full">
            <SegmentedControl
              data-testid="schedule-kind-tab"
              label="予定の種類"
              onChange={onKindChange}
              options={KIND_OPTIONS}
              value={kind}
              variant="white"
            />
          </div>
        )
      }
      isDirty={form.formState.isDirty || scope?.following.isDirty === true}
      isOpen
      onCloseRequest={onClose}
      stickyFooter={(requestClose) => (
        <>
          {submitError !== undefined && (
            <p className="mr-auto self-center text-caption text-danger" role="alert">
              {submitError}
            </p>
          )}
          <Button
            className="shrink-0"
            data-testid={cancelTestId}
            onClick={requestClose}
            variant="secondary"
          >
            キャンセル
          </Button>
          <Button
            className="shrink-0"
            data-testid={submitTestId}
            disabled={following?.canSubmit === false}
            form={following?.formId ?? FORM_ID}
            isLoading={following?.isSubmitting ?? form.formState.isSubmitting}
            type="submit"
          >
            {submitLabel}
          </Button>
        </>
      )}
      title={title}
    >
      {notice}
      {scope !== undefined && (
        <div className="mb-4 max-w-100">
          <SegmentedControl
            data-testid="schedule-edit-scope"
            label="変更の範囲"
            onChange={scope.onChange}
            options={SCOPE_OPTIONS}
            value={scope.value}
          />
        </div>
      )}
      {following === undefined ? (
        <ScheduleForm {...formProps} form={form} id={FORM_ID} />
      ) : (
        following.body
      )}
    </Modal>
  )
}
