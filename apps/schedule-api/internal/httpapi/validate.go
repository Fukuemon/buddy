package httpapi

import (
	"errors"
	"maps"
	"reflect"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/httpapi/openapi"
)

// slotRules は、単発と繰り返しの予定の作成に共通の本文の規則である。
var slotRules = map[string]string{
	"ScheduleTypeId": "required,ulid",
	"Date":           "required",
	"StartTime":      "required",
	"EndTime":        "required",
	"StaffId":        "required,ulid",
	"Title":          "omitempty,max=255",
	"Description":    "omitempty,max=2000",
}

func withRules(base, extra map[string]string) map[string]string {
	out := maps.Clone(base)
	maps.Copy(out, extra)
	return out
}

// bodyRules は、本文の型ごとの validator の規則である。キーは生成した型の項目の Go の名前である。
// 生成した型はタグを持たないので、規則はここに置く。日付と時刻の形は、handler が civil で読むときに確かめる。
var bodyRules = []struct {
	of    any
	rules map[string]string
}{
	{of: openapi.CreateNameRequest{}, rules: map[string]string{"Name": "required,max=255"}},
	{of: openapi.CreatePositionJSONRequestBody{}, rules: map[string]string{
		"Name": "required,max=255", "PolicyIds": "omitempty,dive,ulid",
	}},
	{of: openapi.CreateUserJSONRequestBody{}, rules: map[string]string{
		"Username":     "required,max=128",
		"Email":        "required,email,max=320",
		"PhoneNumber":  "omitempty,max=12",
		"DepartmentId": "required,ulid",
		"TeamId":       "required,ulid",
		"PositionId":   "required,ulid",
	}},
	{of: openapi.ChangeUserPositionJSONRequestBody{}, rules: map[string]string{"PositionId": "required,ulid"}},
	{of: openapi.AddUserPolicyJSONRequestBody{}, rules: map[string]string{
		"PolicyId": "required,ulid", "TargetUserIds": "omitempty,dive,ulid", "TargetTeamIds": "omitempty,dive,ulid",
	}},
	{of: openapi.CreatePatientJSONRequestBody{}, rules: map[string]string{
		"Name":            "required,max=255",
		"PreferredTime":   "required",
		"PreferredGender": "required",
		"ServiceCodeId":   "required,ulid",
		"AssignedStaffId": "required,ulid",
	}},
	{of: openapi.VisitInfoRequest{}, rules: map[string]string{
		"PatientId":        "required,ulid",
		"AssignedStaffId":  "required,ulid",
		"CompanionId":      "omitempty,ulid",
		"ServiceCodeId":    "required,ulid",
		"VisitCategoryIds": "omitempty,dive,ulid",
	}},
	{of: openapi.SlotRequest{}, rules: slotRules},
	{of: openapi.CreateRecurringScheduleJSONRequestBody{}, rules: withRules(slotRules, map[string]string{"RecurringRule": "required"})},
	{of: openapi.RecurringRule{}, rules: map[string]string{"Frequency": "required,oneof=weekly monthly"}},
	{of: openapi.ChangeOccurrenceJSONRequestBody{}, rules: withRules(slotRules, map[string]string{"OriginalDate": "required"})},
	{of: openapi.CancelScheduleJSONRequestBody{}, rules: map[string]string{"Reason": "required,max=255"}},
}

var bodyValidator = newBodyValidator()

func newBodyValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		return name
	})
	for _, r := range bodyRules {
		v.RegisterStructValidationMapRules(r.rules, r.of)
	}
	return v
}

// validateBody は、本文を持つ操作の本文を bodyRules で検証してから、handler を呼ぶ。
// 誤りがあれば、handler を呼ばずに 400 になるエラーを返す。
func validateBody(f openapi.StrictHandlerFunc, _ string) openapi.StrictHandlerFunc {
	return func(c *gin.Context, request any) (any, error) {
		if body := reflect.ValueOf(request).FieldByName("Body"); body.IsValid() && !body.IsNil() {
			if err := bodyValidator.Struct(body.Interface()); err != nil {
				return nil, invalidRequest(validationMessage(err))
			}
		}
		return f(c, request)
	}
}

func validationMessage(err error) string {
	var ves validator.ValidationErrors
	if !errors.As(err, &ves) {
		return bodyErrorPrefix + err.Error()
	}
	msgs := make([]string, 0, len(ves))
	for _, fe := range ves {
		msgs = append(msgs, fieldPath(fe.Namespace())+" が "+fe.Tag()+" を満たしません")
	}
	return strings.Join(msgs, "、")
}

// fieldPath は、validator の Namespace（例は "SlotRequest.visit_info.patient_id"）から、先頭の本文の型の名前を外す。
func fieldPath(namespace string) string {
	_, path, _ := strings.Cut(namespace, ".")
	return path
}
