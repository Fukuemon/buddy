import { createOpenApiHttp } from 'openapi-msw'

import type { paths } from '#/api/generated/schedule'

import { withAuth } from './withAuth'
import {
  createMockImportPreview,
  createMockImportResult,
  createMockSchedules,
  mockExportIssues,
  mockExternalCalendars,
  mockMe,
  mockServiceAccount,
  mockPatients,
  mockScheduleTypes,
  mockServiceCodes,
  mockStaff,
  mockTeams,
  mockVisitCategories,
  scheduleFromRequest,
} from './scheduleData'

/**
 * 予定の API（baseUrl）のフェイクの handler を作る。成功のレスポンスだけを返し、作成と置き換えの結果は残さない。
 * 異常系は、テストごとに server.use() で上書きする。
 */
export const createScheduleHandlers = (baseUrl: string) => {
  const http = createOpenApiHttp<paths>({ baseUrl })
  return [
    http.get(
      '/v1/me',
      withAuth(({ response }) => response(200).json(mockMe)),
    ),
    http.get(
      '/v1/schedule_types',
      withAuth(({ response }) => response(200).json(mockScheduleTypes)),
    ),
    http.get(
      '/v1/visit_infos/service_codes',
      withAuth(({ response }) => response(200).json(mockServiceCodes)),
    ),
    http.get(
      '/v1/visit_infos/visit_categories',
      withAuth(({ response }) => response(200).json(mockVisitCategories)),
    ),
    http.get(
      '/v1/facilities/{facility_id}/teams',
      withAuth(({ response }) => response(200).json(mockTeams)),
    ),
    http.get(
      '/v1/facilities/{facility_id}/users',
      withAuth(({ response }) => response(200).json(mockStaff)),
    ),
    http.get(
      '/v1/facilities/{facility_id}/patients',
      withAuth(({ response }) => response(200).json(mockPatients)),
    ),
    http.get(
      '/v1/facilities/{facility_id}/schedules',
      withAuth(({ response }) =>
        response(200).json({ schedules: createMockSchedules(new Date()), recurring_schedules: [] }),
      ),
    ),
    http.get(
      '/v1/schedules/{schedule_id}',
      withAuth(({ params, response }) => {
        const found = createMockSchedules(new Date()).find((s) => s.id === params.schedule_id)
        return found
          ? response(200).json(found)
          : response(404).json({ code: 'not_found', message: '予定がありません' })
      }),
    ),
    http.post(
      '/v1/facilities/{facility_id}/schedules',
      withAuth(async ({ request, response }) =>
        response(201).json(scheduleFromRequest('schedule-created', await request.json())),
      ),
    ),
    http.put(
      '/v1/schedules/{schedule_id}',
      withAuth(async ({ params, request, response }) =>
        response(200).json(scheduleFromRequest(params.schedule_id, await request.json())),
      ),
    ),
    http.get(
      '/v1/facilities/{facility_id}/calendar_service_account',
      withAuth(({ response }) => response(200).json({ email: mockServiceAccount })),
    ),
    http.get(
      '/v1/facilities/{facility_id}/external_calendars',
      withAuth(({ response }) => response(200).json({ items: mockExternalCalendars })),
    ),
    http.post(
      '/v1/facilities/{facility_id}/external_calendars/check',
      withAuth(({ response }) => response(200).json({ readable: true })),
    ),
    http.post(
      '/v1/facilities/{facility_id}/external_calendars',
      withAuth(async ({ params, request, response }) => {
        const { staff_id, calendar_id } = await request.json()
        return response(201).json({
          ...mockExternalCalendars[1],
          id: 'calendar-created',
          facility_id: params.facility_id,
          staff_id,
          calendar_id,
        })
      }),
    ),
    http.delete(
      '/v1/external_calendars/{external_calendar_id}',
      withAuth(({ response }) => response(204).empty()),
    ),
    http.post(
      '/v1/external_calendars/{external_calendar_id}/import_previews',
      withAuth(async ({ request, response }) =>
        response(200).json(createMockImportPreview(await request.json())),
      ),
    ),
    http.post(
      '/v1/external_calendars/{external_calendar_id}/imports',
      withAuth(async ({ params, request, response }) => {
        const { decisions, ...range } = await request.json()
        return response(201).json(
          createMockImportResult(
            params.external_calendar_id,
            createMockImportPreview(range),
            decisions,
          ),
        )
      }),
    ),
    http.get(
      '/v1/facilities/{facility_id}/calendar_export_issues',
      withAuth(({ response }) => response(200).json({ items: mockExportIssues })),
    ),
    http.post(
      '/v1/calendar_exports/{calendar_export_id}/retries',
      withAuth(({ params, response }) => {
        const found = mockExportIssues.find((i) => i.id === params.calendar_export_id)
        if (found === undefined)
          return response(404).json({ code: 'not_found', message: 'リソースが見つかりません' })
        const {
          staff_id: _,
          staff_name: __,
          date: ___,
          start_time: ____,
          end_time: _____,
          ...issue
        } = found
        return response(202).json({
          ...issue,
          id: params.calendar_export_id,
          status: 'pending',
          error_code: null,
          attempts: 0,
        })
      }),
    ),
  ]
}
