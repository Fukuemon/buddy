# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリの直下である。go.mod の replace が ../../packages/go を指すため（ADR-0007）。
# 例: docker build -f services/schedule/Dockerfile -t buddy-schedule-api .

FROM golang:1.27 AS build
WORKDIR /src
COPY packages/go/go.mod packages/go/go.sum packages/go/
COPY services/schedule/go.mod services/schedule/go.sum services/schedule/
WORKDIR /src/services/schedule
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY packages/go/ /src/packages/go/
COPY services/schedule/ /src/services/schedule/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# ローカル環境の compose が予定の API と calendarpit の間に置く中継。docker build --target gcalhold で作り、本番のイメージには入れない。
FROM build AS gcalhold-build
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gcalhold ./cmd/gcalhold

FROM gcr.io/distroless/static-debian12:nonroot AS gcalhold
COPY --from=gcalhold-build /out/gcalhold /usr/local/bin/
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/gcalhold"]

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /out/migrate /usr/local/bin/
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/api"]
