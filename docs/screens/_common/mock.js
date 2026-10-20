/**
 * 画面のモックの共通の処理。モックの HTML の body の末尾で読む。
 *
 * - body の data-view の端末の幅で .screen を描く。URL の ?view= が data-view より優先する。
 * - data-m を持つ要素の左上に、構成番号の印を .markers に重ねる。data-testid があれば、印の横に出せる。
 * - 端末、番号、testid、幅に合わせるかを切り替えるツールバーを body の末尾に作る。
 * - 埋め込んだ親のページに、中身の高さを postMessage で知らせる（docs/javascripts/embed-mock.js が受ける）。
 *
 * 画面の中の操作で表示を変えたら、mockRefresh() を呼んで印を置き直す。
 */
;(() => {
  /** 端末の名前と、画面の幅と最低の高さ（px）。値はここだけに書く */
  const VIEWS = {
    mobile: { label: 'モバイル', width: 390, height: 844 },
    tablet: { label: 'タブレット縦', width: 768, height: 1024 },
    'tablet-wide': { label: 'タブレット横', width: 1024, height: 768 },
    desktop: { label: 'PC', width: 1440, height: 900 },
  }
  const DEFAULT_VIEW = 'desktop'

  const params = new URLSearchParams(location.search)
  const body = document.body
  const stage = document.querySelector('.stage')
  const screen = document.querySelector('.screen')
  const markers = document.querySelector('.markers')
  if (!stage || !screen || !markers) {
    throw new Error('モックに .stage、.screen、.markers がない')
  }

  const state = {
    view: pickView(params.get('view') ?? body.dataset.view),
    markers: params.get('markers') !== 'off',
    testids: params.get('testids') === 'on',
    fit: params.get('fit') !== 'off',
  }

  function pickView(name) {
    return name && Object.hasOwn(VIEWS, name) ? name : DEFAULT_VIEW
  }

  function applyView() {
    const view = VIEWS[state.view]
    body.dataset.view = state.view
    screen.style.setProperty('--mock-width', `${view.width}px`)
    screen.style.setProperty('--mock-height', `${view.height}px`)
    const available = document.documentElement.clientWidth - 32
    stage.style.zoom = state.fit && view.width > available ? String(available / view.width) : ''
  }

  function placeMarkers() {
    markers.replaceChildren()
    const zoom = Number(stage.style.zoom) || 1
    const origin = stage.getBoundingClientRect()
    for (const el of screen.querySelectorAll('[data-m]')) {
      if (el.getClientRects().length === 0) continue
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue
      const rect = el.getBoundingClientRect()
      const marker = document.createElement('span')
      marker.className = 'marker'
      marker.style.left = `${(rect.left - origin.left) / zoom}px`
      marker.style.top = `${(rect.top - origin.top) / zoom}px`
      const number = document.createElement('span')
      number.className = 'marker__number'
      number.textContent = el.dataset.m
      marker.append(number)
      if (el.dataset.testid) {
        const testid = document.createElement('span')
        testid.className = 'marker__testid'
        testid.textContent = el.dataset.testid
        marker.append(testid)
      }
      markers.append(marker)
    }
  }

  let sentHeight = 0

  function notifyParent() {
    if (window.parent === window) return
    // documentElement.scrollHeight は iframe の高さより小さくならないので、body の高さを送る
    const height = Math.ceil(body.getBoundingClientRect().height)
    if (height === sentHeight) return
    sentHeight = height
    window.parent.postMessage({ source: 'buddy-mock', type: 'resize', height }, '*')
  }

  function syncUrl() {
    const next = new URLSearchParams(location.search)
    next.set('view', state.view)
    for (const [key, on, fallback] of [
      ['markers', state.markers, true],
      ['testids', state.testids, false],
      ['fit', state.fit, true],
    ]) {
      if (on === fallback) next.delete(key)
      else next.set(key, on ? 'on' : 'off')
    }
    try {
      history.replaceState(null, '', `?${next}`)
    } catch {
      // file:// で開いたときは URL を書き換えられないブラウザがある。切り替えは画面にだけ反映する
    }
  }

  function refresh() {
    applyView()
    body.dataset.markers = state.markers ? 'on' : 'off'
    body.dataset.testids = state.testids ? 'on' : 'off'
    placeMarkers()
    for (const button of document.querySelectorAll('.mock-toolbar [data-view-name]')) {
      button.setAttribute('aria-pressed', String(button.dataset.viewName === state.view))
    }
    notifyParent()
  }

  function buildToolbar() {
    const bar = document.createElement('div')
    bar.className = 'mock-toolbar'
    const views = document.createElement('div')
    views.className = 'mock-toolbar__views'
    views.setAttribute('role', 'group')
    views.setAttribute('aria-label', '端末')
    for (const [name, view] of Object.entries(VIEWS)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.viewName = name
      button.textContent = `${view.label} ${view.width}`
      button.addEventListener('click', () => {
        state.view = name
        syncUrl()
        refresh()
      })
      views.append(button)
    }
    bar.append(views)
    for (const [key, label] of [
      ['markers', '構成番号'],
      ['testids', 'data-testid'],
      ['fit', '幅に合わせる'],
    ]) {
      const wrapper = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = state[key]
      input.addEventListener('change', () => {
        state[key] = input.checked
        syncUrl()
        refresh()
      })
      wrapper.append(input, label)
      bar.append(wrapper)
    }
    body.append(bar)
  }

  buildToolbar()
  refresh()
  window.addEventListener('resize', refresh)
  window.addEventListener('load', refresh)
  document.fonts?.ready.then(refresh)

  /** 画面の中の操作で表示を変えた後に呼び、構成番号の印を置き直す */
  window.mockRefresh = refresh
})()
