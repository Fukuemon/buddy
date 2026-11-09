import { ActionMenu, type ActionMenuItem, Avatar, Button, Loading, StatusBadge } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { PatientRecord, ServiceCodeRecord, StaffRecord } from '#/api/types'
import { RefetchErrorMessage } from '#/components/page/RefetchErrorMessage'

import { assignedStaffLabel, endedLabel, serviceCodeLabel } from '../lib/format'

/** 利用者の詳細の画面の状態。canRetry は、利用者が見つからなかったときに false にする。 */
export type PatientDetailViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string; canRetry: boolean }
  | {
      status: 'ready'
      patient: PatientRecord
      /** 読み終えた後に読み直して、利用者を読めなかったか。 */
      refetchFailed?: boolean
    }

export type PatientDetailViewProps = {
  state: PatientDetailViewState
  /** 一度も読めなかったときに、利用者を読み直す。 */
  onRetry: () => void
  /** 読み終えた後に読めなかった利用者を読み直す。 */
  onRefetch?: () => void
  /** サービスの時間の範囲を出すためのサービスコード。読み終えるまでは undefined にし、コードだけを出す。 */
  serviceCodes?: readonly ServiceCodeRecord[]
  /** 担当の職員の休職と退職を出すための職員。読み終えるまでは undefined にする。 */
  staffList?: readonly StaffRecord[]
  onEdit: () => void
  onEnd: () => void
  onResume: () => void
}

/**
 * 利用者の詳細の画面の本文。利用者の一覧へのリンク、利用者の見出し（頭文字の丸、名前、状態の印、編集と「…」）、プロフィールを縦に並べる。
 * 「…」のメニューには、利用中なら利用の終了を、利用の終了なら利用の再開を入れる。
 */
export const PatientDetailView = (props: PatientDetailViewProps) => {
  const { state, onRetry } = props
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <a
        className="inline-flex min-h-11 items-center self-start rounded-8 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
        data-testid="patient-detail-back"
        href="/patients"
      >
        ← 利用者の一覧
      </a>
      {state.status === 'loading' && (
        <div data-testid="patient-detail-loading">
          <Loading description="読み込んでいます" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-danger" data-testid="patient-detail-error" role="alert">
            {state.message}
          </p>
          {state.canRetry && (
            <Button
              data-testid="patient-detail-retry"
              onClick={onRetry}
              size="S"
              variant="secondary"
            >
              読み直す
            </Button>
          )}
        </div>
      )}
      {state.status === 'ready' && (
        <PatientDetailBody
          {...props}
          patient={state.patient}
          refetchFailed={state.refetchFailed === true}
        />
      )}
    </div>
  )
}

const PatientDetailBody = ({
  patient,
  serviceCodes,
  staffList,
  onEdit,
  onEnd,
  onResume,
  onRefetch,
  refetchFailed,
}: PatientDetailViewProps & { patient: PatientRecord; refetchFailed: boolean }) => {
  const ended = endedLabel(patient)
  const menuItems: ActionMenuItem[] =
    ended === undefined
      ? [{ label: '利用を終了する', onSelect: onEnd, 'data-testid': 'patient-detail-end' }]
      : [{ label: '利用を再開する', onSelect: onResume, 'data-testid': 'patient-detail-resume' }]
  const code = serviceCodes?.find((c) => c.id === patient.service_code_id)
  const rows: [string, ReactNode][] = [
    ['サービス', code === undefined ? patient.service_code : serviceCodeLabel(code)],
    ['希望の時間帯', patient.preferred_time],
    ['希望する担当の性別', patient.preferred_gender],
    ['担当の職員', assignedStaffLabel(patient, staffList)],
    ...(ended === undefined
      ? []
      : ([
          [
            '利用',
            <span data-testid="patient-detail-status-text" key="status">
              予定の利用者に選べません。
            </span>,
          ],
        ] as [string, ReactNode][])),
  ]

  return (
    <>
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center">
        <div className="flex min-w-0 grow items-center gap-3">
          <Avatar isMuted={ended !== undefined} name={patient.name} size="L" />
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-heading-md" data-testid="patient-detail-name">
              {patient.name}
            </h1>
            {ended !== undefined && (
              <StatusBadge data-testid="patient-detail-status" tone="muted">
                {ended}
              </StatusBadge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button data-testid="patient-detail-edit" onClick={onEdit} size="S" variant="secondary">
            編集
          </Button>
          <ActionMenu data-testid="patient-detail-menu" items={menuItems} label="ほかの操作" />
        </div>
      </div>
      {refetchFailed && onRefetch !== undefined && <RefetchErrorMessage onRetry={onRefetch} />}
      <section
        aria-label="プロフィール"
        className="rounded-8 border border-border bg-surface p-4 desktop:p-5"
        data-testid="patient-detail-profile"
      >
        <dl className="grid gap-x-4 desktop:grid-cols-[10em_1fr] desktop:gap-y-2">
          {rows.map(([label, value]) => (
            <div className="contents" key={label}>
              <dt className="text-caption text-text-secondary desktop:flex desktop:min-h-11 desktop:items-center desktop:text-body">
                {label}
              </dt>
              <dd className="mb-3 flex min-h-11 items-center text-body break-all desktop:mb-0">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
