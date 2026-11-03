// Package openapi は、openapi.yaml から oapi-codegen が生成した、照合の API の型と strict server のインターフェースを持つ。
package openapi

//go:generate go tool oapi-codegen -config ../../../oapi-codegen.yaml ../../../openapi.yaml
