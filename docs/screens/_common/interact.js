/**
 * 画面のモックの中の操作。モックの HTML の body の末尾で、mock.js の次に読む。
 * 操作は、要素に付けた次の属性で決まる。API の呼び出しと保存はまねない。
 *
 * - data-go="<モックのパス>": 押すと、そのモックへ移る。パスはこの HTML からの相対で書く。
 *   デバイス、構成番号、testid、幅に合わせるかの選択は、mock.js が body の data-* に置いた値を search params にして引き継ぐ。
 * - data-toggle: 押すと、is-on を付け外す。チェックボックスとトグルに使う。
 * - data-choice="<組の名前>": 押すと is-on を付け、同じ組のほかの要素から外す。ラジオボタンとチップに使う。
 * - data-panel="<名前>": 開閉する要素。data-open="<名前>" を押すと開き、data-close="<名前>" を押すと閉じる。
 *   開いている間は panel に is-open を付け、開くボタンの aria-expanded を true にする。デバイスを切り替えると閉じる。
 *   開くと panel の中の最初のフォーカスできる要素へ、閉じると開くボタンへフォーカスを移す。
 *   data-panel-modal も付けた panel を開いている間は、panel の外の要素に構成番号の印を出さない。
 * - data-escape: Escape キーで押す。見えている要素だけを押す。
 *
 * 押せる要素には tabindex="0" を付け、Enter と Space でも押せるようにする。aria-disabled="true" の要素は押せない。
 * role の無い要素には、data-toggle なら checkbox、data-choice なら radio、ほかは button の role を付け、
 * checkbox と radio の aria-checked を is-on に合わせる。tabindex="-1" の要素と、button、a、input には付けない。
 * 表示を変えたら、mock.js の mockRefresh() で印を置き直す。
 */
;(() => {
  const ACTION = '[data-go], [data-toggle], [data-choice], [data-open], [data-close]'
  const screen = document.querySelector('.screen')

  const NATIVE = 'button, a[href], input, select, textarea'
  const FOCUSABLE = `${NATIVE}, [tabindex]:not([tabindex="-1"])`

  function isVisible(el) {
    if (el.getClientRects().length === 0) return false
    return !el.checkVisibility || el.checkVisibility({ visibilityProperty: true })
  }

  function syncChecked(el) {
    if (['checkbox', 'radio'].includes(el.getAttribute('role')))
      el.setAttribute('aria-checked', String(el.classList.contains('is-on')))
  }

  for (const el of screen.querySelectorAll(ACTION)) {
    if (el.matches(NATIVE)) continue
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0
    if (el.tabIndex < 0 || el.hasAttribute('role')) continue
    if (el.hasAttribute('data-toggle')) el.setAttribute('role', 'checkbox')
    else if (el.dataset.choice) el.setAttribute('role', 'radio')
    else el.setAttribute('role', 'button')
    syncChecked(el)
  }

  function go(path) {
    const url = new URL(path, location.href)
    const { view, markers, testids, fit } = document.body.dataset
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (markers === 'off') params.set('markers', 'off')
    if (testids === 'on') params.set('testids', 'on')
    if (fit === 'off') params.set('fit', 'off')
    url.search = params.toString()
    location.assign(url)
  }

  function panels(name) {
    return screen.querySelectorAll(`[data-panel="${CSS.escape(name)}"]`)
  }

  function setPanel(panel, isOpen) {
    panel.classList.toggle('is-open', isOpen)
    const openers = [...screen.querySelectorAll(`[data-open="${CSS.escape(panel.dataset.panel)}"]`)]
    for (const opener of openers) opener.setAttribute('aria-expanded', String(isOpen))
    if (panel.hasAttribute('data-panel-modal')) coverMarkers(panel, isOpen)
    const target = isOpen
      ? [...panel.querySelectorAll(FOCUSABLE)].find(isVisible)
      : openers.find(isVisible)
    target?.focus()
  }

  /** 開いた panel の外の要素の data-m を data-m-covered に移し、閉じたら戻す */
  function coverMarkers(panel, isCovered) {
    for (const el of screen.querySelectorAll('[data-m], [data-m-covered]')) {
      if (panel.contains(el)) continue
      if (isCovered && el.dataset.m) {
        el.dataset.mCovered = el.dataset.m
        delete el.dataset.m
      } else if (!isCovered && el.dataset.mCovered) {
        el.dataset.m = el.dataset.mCovered
        delete el.dataset.mCovered
      }
    }
  }

  function act(el) {
    if (el.getAttribute('aria-disabled') === 'true') return
    if (el.dataset.go) {
      go(el.dataset.go)
      return
    }
    if (el.hasAttribute('data-toggle')) {
      el.classList.toggle('is-on')
      syncChecked(el)
    }
    if (el.dataset.choice) {
      for (const other of screen.querySelectorAll(
        `[data-choice="${CSS.escape(el.dataset.choice)}"]`,
      )) {
        other.classList.toggle('is-on', other === el)
        syncChecked(other)
      }
    }
    if (el.dataset.open) for (const panel of panels(el.dataset.open)) setPanel(panel, true)
    if (el.dataset.close) for (const panel of panels(el.dataset.close)) setPanel(panel, false)
    mockRefresh()
  }

  screen.addEventListener('click', (event) => {
    const el = event.target.closest(ACTION)
    if (el) act(el)
  })

  screen.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const el = event.target.closest(ACTION)
    if (!el || el !== event.target) return
    event.preventDefault()
    act(el)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const el = [...screen.querySelectorAll('[data-escape]')].find(isVisible)
    if (el) act(el)
  })

  document.querySelector('.mock-toolbar').addEventListener('click', (event) => {
    if (!event.target.closest('[data-view-name]')) return
    const open = screen.querySelectorAll('[data-panel].is-open')
    for (const panel of open) setPanel(panel, false)
    if (open.length > 0) mockRefresh()
  })
})()
