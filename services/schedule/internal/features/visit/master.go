package visit

// ServiceCode は、レセプトのサービスコードである。StartMinutes と EndMinutes は、対象の提供時間の範囲である。
type ServiceCode struct {
	ID           string
	Code         string
	StartMinutes int
	EndMinutes   int
}

// Category は、夜勤や緊急のような訪問の区分である。
type Category struct {
	ID   string
	Name string
}
