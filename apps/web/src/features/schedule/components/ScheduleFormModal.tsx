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
  onClose: () => void
}

const FORM_ID = 'schedule-form'

/**
 * 予定のフォームをモーダルで出す。モーダルの下端の右に、「キャンセル」と送信のボタンをこの順に置く。
 * 「キャンセル」は閉じるボタンと同じく、入力を変えていれば破棄するかを確認してから閉じる。
 */
export const ScheduleFormModal = ({
  title,
  submitLabel,
  submitTestId,
  cancelTestId,
  onKindChange,
  submitError,
  notice,
  onClose,
  form,
  ...formProps
}: ScheduleFormModalProps) => {
  const kind = form.watch('kind')

  return (
    <Modal
      data-testid="schedule-form-modal"
      headerContent={
        onKindChange === undefined ? undefined : (
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
      isDirty={form.formState.isDirty}
      isOpen
      onCloseRequest={onClose}
      stickyFooter={(requestClose) => (
        <>
          {submitError !== undefined && (
            <p className="mr-auto self-center text-caption text-danger" role="alert">
              {submitError}
            </p>
          )}
          <Button data-testid={cancelTestId} onClick={requestClose} variant="secondary">
            キャンセル
          </Button>
          <Button
            data-testid={submitTestId}
            form={FORM_ID}
            isLoading={form.formState.isSubmitting}
            type="submit"
          >
            {submitLabel}
          </Button>
        </>
      )}
      title={title}
    >
      {notice}
      <ScheduleForm {...formProps} form={form} id={FORM_ID} />
    </Modal>
  )
}
