# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリの直下である。go.mod の replace が ../../packages/go を指すため（ADR-0007）。
# 例: docker build -f apps/receipt-api/Dockerfile -t buddy-receipt-api .

FROM golang:1.27 AS build
WORKDIR /src
COPY packages/go/go.mod packages/go/go.sum packages/go/
COPY apps/receipt-api/go.mod apps/receipt-api/go.sum apps/receipt-api/
WORKDIR /src/apps/receipt-api
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY packages/go/ /src/packages/go/
COPY apps/receipt-api/ /src/apps/receipt-api/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
