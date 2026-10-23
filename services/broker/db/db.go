// Package db は、ブローカーのスキーマのマイグレーションの SQL を、バイナリに埋め込んで渡す。
package db

import "embed"

// Migrations は、golang-migrate の形式（migrations/<版>_<名前>.{up,down}.sql）のマイグレーションである。
//
//go:embed migrations/*.sql
var Migrations embed.FS
