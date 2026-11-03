package organization

import (
	"time"
)

// Facility は、訪問看護の事業所である。
type Facility struct {
	ID   string
	Name string
	// OrgID は、ID ブローカーの組織の ID で、結び付けるまで空である。
	OrgID     string
	CreatedAt time.Time
	UpdatedAt time.Time
}
