import { SCHEDULE_KINDS, type ScheduleKind } from '#/api/types'
import { Button } from '#/components/base/Button'
import { Modal } from '#/components/base/Modal'
import { TextTab } from '#/components/base/TextTab'

import { SCHEDULE_KIND_LABEL } from '../constants/scheduleLabels'
import { ScheduleForm, type ScheduleFormProps } from './ScheduleForm'

const KIND_TABS = SCHEDULE_KINDS.map((kind) => ({ id: kind, label: SCHEDULE_KIND_LABEL[kind] }))

export type ScheduleFormModalProps = Omit<ScheduleFormProps, 'id'> & {
  title: string
  submitLabel: string
  /** 送信のボタンの data-testid。作成と編集で分ける。 */
  submitTestId: string
  /** 渡したときだけ、通常と訪問を切り替えるタブを出す。 */
  onKindChange?: (kind: ScheduleKind) => void
  /** 送信に失敗したときの文。 */
  submitError?: string
  onClose: () => void
}

const FORM_ID = 'schedule-form'

/** 予定のフォームをモーダルで出す。送信のボタンはモーダルの下端に置く。 */
export const ScheduleFormModal = ({
  title,
  submitLabel,
  submitTestId,
  onKindChange,
  submitError,
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
          <div className="max-w-60">
            <TextTab
              activeTabId={kind}
              data-testid="schedule-kind-tab"
              onTabChange={onKindChange}
              tabs={KIND_TABS}
              variant="white"
            />
          </div>
        )
      }
      isDirty={form.formState.isDirty}
      isOpen
      onCloseRequest={onClose}
      stickyFooter={
        <>
          {submitError !== undefined && (
            <p className="mr-auto self-center text-sm text-incorrect-main" role="alert">
              {submitError}
            </p>
          )}
          <Button
            data-testid={submitTestId}
            form={FORM_ID}
            isLoading={form.formState.isSubmitting}
            type="submit"
          >
            {submitLabel}
          </Button>
        </>
      }
      title={title}
    >
      <ScheduleForm {...formProps} form={form} id={FORM_ID} />
    </Modal>
  )
}
