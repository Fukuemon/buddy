package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain/visit"
)

// VisitMasterUsecase は、訪問の情報のマスタのハンドラが使う操作である。
type VisitMasterUsecase interface {
	ListServiceCodes(ctx context.Context) ([]visit.ServiceCode, error)
	ListCategories(ctx context.Context) ([]visit.Category, error)
}

type serviceCodeResponse struct {
	ID                    string `json:"id"`
	Code                  string `json:"code"`
	ServiceTimeRangeStart int    `json:"service_time_range_start"`
	ServiceTimeRangeEnd   int    `json:"service_time_range_end"`
}

type visitCategoryResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func toServiceCode(s visit.ServiceCode) serviceCodeResponse {
	return serviceCodeResponse{ID: s.ID, Code: s.Code, ServiceTimeRangeStart: s.StartMinutes, ServiceTimeRangeEnd: s.EndMinutes}
}

func toVisitCategory(c visit.Category) visitCategoryResponse {
	return visitCategoryResponse(c)
}

type visitHandler struct {
	uc  VisitMasterUsecase
	log *slog.Logger
}

func (h visitHandler) register(r gin.IRouter) {
	r.GET("/visit_infos/service_codes", h.listServiceCodes)
	r.GET("/visit_infos/visit_categories", h.listCategories)
}

func (h visitHandler) listServiceCodes(c *gin.Context) {
	cs, err := h.uc.ListServiceCodes(c.Request.Context())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(cs, toServiceCode))
}

func (h visitHandler) listCategories(c *gin.Context) {
	cs, err := h.uc.ListCategories(c.Request.Context())
	if err != nil {
		writeError(c, h.log, err)
		return
	}
	c.JSON(http.StatusOK, mapSlice(cs, toVisitCategory))
}
