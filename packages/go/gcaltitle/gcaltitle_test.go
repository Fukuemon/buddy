package gcaltitle

import "testing"

func TestParseTitle(t *testing.T) {
	tests := []struct {
		name        string
		title       string
		wantVisit   bool
		wantService string
		wantClient  string
		wantErr     bool
	}{
		{"通常", "【訪看I2】利用者A", true, "訪看I2", "利用者A", false},
		{"】の後の半角空白", "【訪看I2】 利用者A", true, "訪看I2", "利用者A", false},
		{"】の後の全角空白", "【訪看I2】　利用者A", true, "訪看I2", "利用者A", false},
		{"利用者名の中の空白は残す", "【訪看I2】利用者 A ", true, "訪看I2", "利用者 A ", false},
		{"前に文字がある", "予定 【訪看I2】利用者A", true, "訪看I2", "利用者A", false},
		{"【】が 2 つ", "【訪看I2】利用者A【備考】", true, "訪看I2", "利用者A【備考】", false},
		{"】が【より前", "】訪看I2【利用者A", true, "", "", true},
		{"利用者名が空", "【訪看I2】", true, "", "", true},
		{"利用者名が空白だけ", "【訪看I2】　 ", true, "", "", true},
		{"サービス内容が空", "【】利用者A", true, "", "", true},
		{"【】がない", "会議", false, "", "", true},
		{"【だけ", "【訪看I2 利用者A", false, "", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsVisitTitle(tt.title); got != tt.wantVisit {
				t.Errorf("IsVisitTitle = %v", got)
			}
			service, client, err := ParseTitle(tt.title)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v", err)
			}
			if service != tt.wantService || client != tt.wantClient {
				t.Errorf("= (%q, %q), want (%q, %q)", service, client, tt.wantService, tt.wantClient)
			}
		})
	}
}
