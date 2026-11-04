package assemble

import (
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/config"
)

func TestAppsFillAllOperations(t *testing.T) {
	for _, cfg := range []config.API{{}, {Calendar: config.Calendar{ExportEnabled: true}}} {
		apps := reflect.ValueOf(newApps(NewRepositories(nil), nil, cfg))
		for i := range apps.NumField() {
			app, name := apps.Field(i), apps.Type().Field(i).Name
			if app.Kind() != reflect.Struct {
				if app.IsNil() {
					t.Errorf("Apps.%s が nil", name)
				}
				continue
			}
			for j := range app.NumField() {
				if app.Field(j).IsNil() {
					t.Errorf("Apps.%s.%s が nil", name, app.Type().Field(j).Name)
				}
			}
		}
	}
}
