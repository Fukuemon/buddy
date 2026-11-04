package patient

import (
	"github.com/Fukuemon/buddy/services/schedule/internal/features/servicecode"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// ServiceCodes は、利用者のデフォルトのサービスコードを確認する。見つからないときは apperr.ErrNotFound を返す。
type ServiceCodes = kernel.Finder[servicecode.ServiceCode]
