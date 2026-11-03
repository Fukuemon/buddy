package visit

// Usecase は、訪問の情報のマスタの操作である。
type Usecase struct {
	masters MasterRepository
}

// NewUsecase は Usecase を作る。
func NewUsecase(masters MasterRepository) *Usecase {
	return &Usecase{masters: masters}
}
