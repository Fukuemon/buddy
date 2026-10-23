# syntax=docker/dockerfile:1
# ビルドの文脈はリポジトリの直下である。go.mod の replace が ../../packages/go を指すため（ADR-0007）。
# 例: docker build -f services/broker/Dockerfile -t broker:local .

FROM golang:1.27 AS build
WORKDIR /src
COPY packages/go/go.mod packages/go/go.sum packages/go/
COPY services/broker/go.mod services/broker/go.sum services/broker/
WORKDIR /src/services/broker
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY packages/go/ /src/packages/go/
COPY services/broker/ /src/services/broker/
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/broker ./cmd/broker && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/broker /out/migrate /usr/local/bin/
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/broker"]
