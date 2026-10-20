// Package auth は、検証したトークンが示す利用者と、リクエストを送った職員を表す。
package auth

// Identity は、署名と有効期限を検証した access token の主張である。
// Email は、EmailVerified が true のときだけ、職員を結び付ける根拠に使える。
// OrgID は、認証のブローカーの組織の ID で、トークンに組織がないときは空である。
type Identity struct {
	Subject       string
	Email         string
	EmailVerified bool
	OrgID         string
}
