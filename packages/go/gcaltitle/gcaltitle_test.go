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

func TestNormalizeService(t *testing.T) {
	tests := []struct{ in, want string }{
		{"訪看I2", "訪看I２"},
		{"訪看Ⅰ2", "訪看I２"},
		{"訪看１2", "訪看I２"},
		{"訪看12", "訪看I２"},
		{"訪看I5･2超", "訪看I５・２超"},
		{"訪看I5・2超", "訪看I５・２超"},
		{"訪看　I2", "訪看 I２"},
		{"基本療養費(1)", "基本療養費(I)"},
		{"難病等複数回訪問加算(2回)", "難病等複数回訪問加算(２回)"},
		{"医", "医"},
		{"訪看I２", "訪看I２"},
	}
	for _, tt := range tests {
		if got := NormalizeService(tt.in); got != tt.want {
			t.Errorf("NormalizeService(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNormalizeClient(t *testing.T) {
	tests := []struct{ in, want string }{
		{"利用者A", "利用者A"},
		{"利用者　A", "利用者A"},
		{"利用者 A", "利用者A"},
		{" 利用者　 A ", "利用者A"},
	}
	for _, tt := range tests {
		if got := NormalizeClient(tt.in); got != tt.want {
			t.Errorf("NormalizeClient(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestFormatRoundTrip(t *testing.T) {
	title := Format("訪看I2", "利用者A")
	if title != "【訪看I2】利用者A" {
		t.Fatalf("Format = %q", title)
	}
	service, client, err := ParseTitle(title)
	if err != nil || service != "訪看I2" || client != "利用者A" {
		t.Errorf("ParseTitle(Format) = (%q, %q, %v)", service, client, err)
	}
}
