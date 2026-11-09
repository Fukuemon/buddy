package main

import (
	"log/slog"
	"net"
	"net/http"
	"time"
)

// newServer は、port で handler を待ち受ける http.Server を作る。
func newServer(logger *slog.Logger, port string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              net.JoinHostPort("", port),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
}
