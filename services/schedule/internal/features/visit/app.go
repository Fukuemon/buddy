package visit

// App は、訪問の情報のマスタの操作である。
type App struct {
	masters MasterRepository
}

// NewApp は App を作る。
func NewApp(masters MasterRepository) *App {
	return &App{masters: masters}
}
