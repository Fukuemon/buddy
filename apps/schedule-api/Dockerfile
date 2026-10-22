# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリの直下である。go.mod の replace が ../../packages/go を指すため（ADR-0007）。
# 例: docker build -f apps/schedule-api/Dockerfile -t buddy-schedule-api .

FROM golang:1.27 AS build
WORKDIR /src
COPY packages/go/go.mod packages/go/go.sum packages/go/
COPY apps/schedule-api/go.mod apps/schedule-api/go.sum apps/schedule-api/
WORKDIR /src/apps/schedule-api
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY packages/go/ /src/packages/go/
COPY apps/schedule-api/ /src/apps/schedule-api/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# ローカル環境の compose が Google Calendar API の代わりに動かすフェイク。docker build --target fakegcal で作り、本番のイメージには入れない。
FROM build AS fakegcal-build
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fakegcal ./cmd/fakegcal

FROM gcr.io/distroless/static-debian12:nonroot AS fakegcal
COPY --from=fakegcal-build /out/fakegcal /usr/local/bin/
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/fakegcal"]

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /out/migrate /usr/local/bin/
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/api"]
