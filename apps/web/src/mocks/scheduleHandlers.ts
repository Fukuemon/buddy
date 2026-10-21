import { createOpenApiHttp } from 'openapi-msw'

import type { paths } from '#/api/generated/schedule'

import { withAuth } from './withAuth'
import {
  createMockSchedules,
  mockMe,
  mockPatients,
  mockScheduleTypes,
  mockServiceCodes,
  mockStaff,
  mockTeams,
  mockVisitCategories,
} from './scheduleData'

/**
 * 予定の API（baseUrl）の偽物の handler を作る。成功の応答だけを返し、作成と置き換えの結果は残さない。
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
      withAuth(async ({ request, response }) => {
        const body = await request.json()
        const [first] = createMockSchedules(new Date())
        return response(201).json({
          ...first,
          ...body,
          id: 'schedule-created',
          title: body.title ?? null,
          description: body.description ?? null,
          visit_info: null,
        })
      }),
    ),
    http.put(
      '/v1/schedules/{schedule_id}',
      withAuth(async ({ params, request, response }) => {
        const body = await request.json()
        const [first] = createMockSchedules(new Date())
        return response(200).json({
          ...first,
          ...body,
          id: params.schedule_id,
          title: body.title ?? null,
          description: body.description ?? null,
          visit_info: null,
        })
      }),
    ),
  ]
}
