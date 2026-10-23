// Package db は、ブローカーのスキーマのマイグレーションとシードの SQL を、バイナリに埋め込んで渡す。
package db

import "embed"

// Migrations は、golang-migrate の形式（migrations/<版>_<名前>.{up,down}.sql）のマイグレーションである。
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Seed は、開発とテストに使うダミーの職員（seed/seed.sql）である。
//
//go:embed seed/seed.sql
var Seed []byte
