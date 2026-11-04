package main

import (
	"reflect"
	"testing"
)

func TestAppsFillAllOperations(t *testing.T) {
	for name, app := range map[string]any{
		"OrganizationApp": organizationApp(nil, nil, nil, nil, nil, nil, nil, nil),
		"VisitMasterApp":  visitMasterApp(nil),
		"PatientApp":      patientApp(nil, nil, nil, nil, nil, nil, nil, nil, nil),
		"StaffApp":        staffApp(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil),
		"ScheduleApp":     scheduleApp(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil),
		"CalendarApp":     calendarApp(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil),
	} {
		v := reflect.ValueOf(app)
		for i := range v.NumField() {
			if v.Field(i).IsNil() {
				t.Errorf("%s.%s が nil", name, v.Type().Field(i).Name)
			}
		}
	}
}
