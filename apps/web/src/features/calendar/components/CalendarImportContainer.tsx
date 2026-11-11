import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { ImportRange, Staff } from '#/api/types'
import { queryKeys } from '#/api/queryKeys'
import { failedBeforeLoad, hasRefetchFailed, refetchFailedQueries } from '#/api/refetch'
import { useBuddyApi } from '#/api/useBuddyApi'

import {
  IMPORT_LOAD_ERROR_MESSAGE,
  importErrorMessage,
  PATIENTS_ERROR_MESSAGE,
  loadErrorMessage,
  previewErrorMessage,
} from '../lib/errorMessage'
import {
  type BoundedImportRange,
  isImportRangeReady,
  nextMonthRange,
  validateImportRange,
} from '../lib/importRange'
import { toDecisions, type ReviewChoices } from '../lib/importSummary'
import {
  cutoverStatusQueryOptions,
  externalCalendarListQueryOptions,
  patientListQueryOptions,
  staffListQueryOptions,
  useImportCalendar,
  usePreviewImport,
} from '../queries'
import { CalendarImportDone } from './CalendarImportDone'
import { CalendarImportForm } from './CalendarImportForm'
import { CalendarImportPreview } from './CalendarImportPreview'
import { CalendarImportView, type CalendarImportViewState } from './CalendarImportView'
import { activePatients } from '#/api/activePatients'

export type CalendarImportContainerProps = {
  /** search params の staff。カレンダーが結び付いていない職員なら、名前の順で最初の職員を選ぶ。 */
  staffId?: Staff['id']
  /** 職員を変えたときに呼ぶ。route が search params に書く。 */
  onStaffChange: (staffId: Staff['id']) => void
}

const CalendarImportContent = ({ staffId, onStaffChange }: CalendarImportContainerProps) => {
  const { api, facilityId } = useBuddyApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const calendarsQuery = useQuery(externalCalendarListQueryOptions(api, facilityId))
  const staffQuery = useQuery(staffListQueryOptions(api, facilityId))
  const cutoverQuery = useQuery(cutoverStatusQueryOptions(api, facilityId))
  // 予定の管理の移行の間は、移行の期間（移行の月の初日から先の全て）だけで取り込む
  const openCutover = cutoverQuery.data?.cutover ?? null
  const preview = usePreviewImport()
  const runImport = useImportCalendar()
  const [selected, setSelected] = useState(staffId)
  const [range, setRange] = useState(() => nextMonthRange(new Date()))
  const previewRange: ImportRange =
    openCutover === null ? range : { range_start: openCutover.range_start, range_end: null }
  const [choices, setChoices] = useState<ReviewChoices>({})
  const needsPatients = (preview.data?.needs_review.length ?? 0) > 0
  const patientsQuery = useQuery({
    ...patientListQueryOptions(api, facilityId),
    enabled: needsPatients,
  })

  const options = (calendarsQuery.data ?? [])
    .flatMap((calendar) => {
      const staff = staffQuery.data?.find((s) => s.id === calendar.staff_id)
      return staff === undefined ? [] : [{ staff, calendar }]
    })
    .sort((a, b) => a.staff.name.localeCompare(b.staff.name, 'ja'))
  const current = options.find((o) => o.staff.id === selected) ?? options[0]

  const screenQueries = [calendarsQuery, staffQuery, cutoverQuery]
  const failed = failedBeforeLoad(screenQueries)
  const state: CalendarImportViewState =
    failed !== undefined
      ? { status: 'error', message: loadErrorMessage(failed.error, IMPORT_LOAD_ERROR_MESSAGE) }
      : calendarsQuery.isPending || staffQuery.isPending || cutoverQuery.isPending
        ? { status: 'loading' }
        : options.length === 0
          ? { status: 'no-calendar' }
          : { status: 'ready' }

  const clearResults = () => {
    preview.reset()
    runImport.reset()
    setChoices({})
  }
  const changeRange = (patch: Partial<BoundedImportRange>) => {
    setRange((prev) => ({ ...prev, ...patch }))
    clearResults()
  }
  const retry = () =>
    Promise.all(
      [
        queryKeys.calendars.list(facilityId),
        queryKeys.staff.list(facilityId),
        queryKeys.calendars.cutover(facilityId),
      ].map((queryKey) => queryClient.resetQueries({ queryKey })),
    )

  const isLocked = preview.isPending || runImport.isPending
  // プレビューの結果は、プレビューしたカレンダーにだけ当てる。一覧の読み直しで選んだ職員が替わったら、結果を出さず、確定もさせない
  const previewed =
    preview.data !== undefined && preview.variables?.calendarId === current?.calendar.id
      ? preview.data
      : undefined
  const decisions = previewed === undefined ? [] : toDecisions(previewed.needs_review, choices)

  return (
    <CalendarImportView
      onRefetch={() => refetchFailedQueries(screenQueries)}
      onRetry={retry}
      refetchFailed={hasRefetchFailed(screenQueries)}
      state={state}
    >
      {current !== undefined && (
        <>
          <CalendarImportForm
            canPreview={
              openCutover !== null || isImportRangeReady(range.range_start, range.range_end)
            }
            cutoverRangeStart={openCutover?.range_start}
            end={range.range_end}
            errorMessage={
              preview.isError ? previewErrorMessage(preview.error, current.staff.name) : undefined
            }
            isLocked={isLocked}
            isPreviewing={preview.isPending}
            onEndChange={(value) => changeRange({ range_end: value })}
            onPreview={() => {
              clearResults()
              preview.mutate({ calendarId: current.calendar.id, range: previewRange })
            }}
            onStaffChange={(id) => {
              setSelected(id)
              clearResults()
              onStaffChange(id)
            }}
            onStartChange={(value) => changeRange({ range_start: value })}
            rangeErrors={validateImportRange(range.range_start, range.range_end)}
            staffId={current.staff.id}
            staffOptions={options.map((o) => o.staff)}
            start={range.range_start}
          />
          {previewed !== undefined && runImport.data === undefined && (
            <CalendarImportPreview
              choices={choices}
              errorMessage={
                runImport.isError
                  ? importErrorMessage(runImport.error)
                  : patientsQuery.isError
                    ? PATIENTS_ERROR_MESSAGE
                    : undefined
              }
              isSubmitting={runImport.isPending}
              onChoiceChange={(eventId, choice) => {
                setChoices((prev) => ({ ...prev, [eventId]: choice }))
                runImport.reset()
              }}
              onSubmit={() =>
                runImport.mutate({
                  calendarId: current.calendar.id,
                  range: { range_start: previewed.range_start, range_end: previewed.range_end },
                  decisions,
                })
              }
              patients={activePatients(patientsQuery.data ?? [])}
              preview={previewed}
              staffName={current.staff.name}
            />
          )}
          {previewed !== undefined && runImport.data !== undefined && (
            <CalendarImportDone
              onBackToCutover={
                openCutover === null ? undefined : () => navigate({ to: '/schedule/link/cutover' })
              }
              onOpenCalendar={() =>
                navigate({
                  to: '/schedule',
                  search: { view: 'month', date: previewed.range_start, staff: [current.staff.id] },
                })
              }
              result={runImport.data}
            />
          )}
        </>
      )}
    </CalendarImportView>
  )
}

/**
 * 予定の取り込みの画面。
 * 結び付けたカレンダーと職員を読み、選んだ職員と期間でプレビューし、確認が必要な予定の取り込み方を選んで確定する。
 */
export const CalendarImportContainer = (props: CalendarImportContainerProps) => {
  return <CalendarImportContent {...props} />
}
