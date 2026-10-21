# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリの直下である（Go の module が直下にあるため）。例: docker build -f apps/receipt-api/Dockerfile -t buddy-receipt-api .

FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY apps/receipt-api/ apps/receipt-api/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./apps/receipt-api/cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
