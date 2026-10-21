// schedule-api と receipt-api が共有するコードの module である。各 API は replace で読む（ADR-0007）。
module github.com/Fukuemon/buddy/packages/go

go 1.27

require (
	github.com/MicahParks/jwkset v0.11.3
	github.com/MicahParks/keyfunc/v3 v3.8.2
	github.com/golang-jwt/jwt/v5 v5.3.1
	golang.org/x/time v0.16.0
)
