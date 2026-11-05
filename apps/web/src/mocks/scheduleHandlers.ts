import { createOpenApiHttp } from 'openapi-msw'

import type { paths } from '#/api/generated/schedule'

import { withAuth } from './withAuth'
import {
  createMockImportPreview,
  createMockImportResult,
  createMockSchedules,
  exportOfIssue,
  mockExportIssues,
  mockExternalCalendars,
  mockFacility,
  mockMe,
  mockServiceAccount,
  mockPatients,
  mockScheduleTypes,
  mockServiceCodes,
  mockStaffList,
  mockTeams,
  mockVisitCategories,
  scheduleFromRequest,
} from './scheduleData'

/**
 * 予定の API（baseUrl）の MSW の handler を作る。成功のレスポンスだけを返し、作成と置き換えの結果は残さない。
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
      '/v1/me/external_calendar',
      withAuth(({ response }) =>
        response(200).json({
          external_calendar: mockExternalCalendars.find((c) => c.staff_id === mockMe.id) ?? null,
        }),
      ),
    ),
    http.get(
      '/v1/facilities/{facility_id}',
      withAuth(({ response }) => response(200).json(mockFacility)),
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
      withAuth(({ response }) => response(200).json(mockStaffList)),
    ),
    http.put(
      '/v1/users/{user_id}',
      withAuth(async ({ params, request, response }) => {
        const found = mockStaffList.find((s) => s.id === params.user_id)
        if (found === undefined)
          return response(404).json({ code: 'not_found', message: 'リソースが見つかりません' })
        const { username, phone_number, department_id, team_id, visits } = await request.json()
        const team = mockTeams.find((t) => t.id === team_id)
        if (department_id !== found.department.id || team === undefined)
          return response(400).json({
            code: 'invalid_input',
            message: '部署かチームがこの事業所に属していません',
          })
        return response(200).json({
          ...found,
          username,
          phone_number: phone_number == null ? null : `+${phone_number.replace(/^\+/, '')}`,
          team: { id: team.id, name: team.name },
          visits,
          sub: null,
          policies: [],
        })
      }),
    ),
    http.get(
      '/v1/users/{user_id}/remaining_assignments',
      withAuth(({ params, response }) =>
        mockStaffList.some((s) => s.id === params.user_id)
          ? response(200).json({ schedules: [], recurring_schedules: [], patients: [] })
          : response(404).json({ code: 'not_found', message: 'リソースが見つかりません' }),
      ),
    ),
    http.get(
      '/v1/facilities/{facility_id}/patients',
      withAuth(({ query, response }) =>
        response(200).json(
          query.get('include_ended') === 'true'
            ? mockPatients
            : mockPatients.filter((patient) => patient.ended_at === null),
        ),
      ),
    ),
    http.get(
      '/v1/patients/{patient_id}',
      withAuth(({ params, response }) => {
        const found = mockPatients.find((patient) => patient.id === params.patient_id)
        return found
          ? response(200).json(found)
          : response(404).json({ code: 'not_found', message: 'リソースが見つかりません' })
      }),
    ),
    http.get(
      '/v1/patients/{patient_id}/remaining_schedules',
      withAuth(({ params, response }) =>
        mockPatients.some((patient) => patient.id === params.patient_id)
          ? response(200).json({ schedules: [], recurring_schedules: [] })
          : response(404).json({ code: 'not_found', message: 'リソースが見つかりません' }),
      ),
    ),
    http.get(
      '/v1/facilities/{facility_id}/schedules',
      withAuth(({ response }) =>
        response(200).json({
          schedules: createMockSchedules(new Date()),
          recurring_schedules: [],
          source_mode: mockFacility.source_mode,
          calendar_syncs: [],
          cutover: null,
        }),
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
        return response(202).json({
          ...exportOfIssue(found),
          status: 'pending',
          error_code: null,
          attempts: 0,
        })
      }),
    ),
  ]
}
