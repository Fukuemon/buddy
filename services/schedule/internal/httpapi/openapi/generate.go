// Package openapi は、openapi.yaml から oapi-codegen が生成した、予定の API の型と gin の strict server のインターフェイスを持つ。
package openapi

//go:generate go tool oapi-codegen -config ../../../oapi-codegen.yaml ../../../openapi.yaml
