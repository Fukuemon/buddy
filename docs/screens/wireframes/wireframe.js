/**
 * 画面のワイヤーフレームが読み込む共通の処理。
 *
 * - `<meta name="wireframe-states" content="<id>:<名前>,...">` の宣言から、data-show-when と
 *   data-hide-when で要素を出し分ける規則を作り、`<html data-state>` を宣言の先頭の状態にする。
 * - ビューア（viewer.html）から状態と注記の切り替えを受け、中身の高さと状態の一覧をビューアへ送る。
 * - 単体で開いたときは、URL の `state` と `notes=on` を読む。
 * - 注記が on のとき、data-ref を持つ要素の左上に構成番号の札を重ねる。
 */
;(() => {
  const STATE_ID = /^[a-z0-9-]+$/
  const root = document.documentElement
  const meta = document.querySelector('meta[name="wireframe-states"]')
  const states = (meta?.content ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [id, ...label] = entry.split(':')
      return { id: id.trim(), label: label.join(':').trim() || id.trim() }
    })
    .filter((state) => STATE_ID.test(state.id))
  const stateIds = states.map((state) => state.id)

  const style = document.createElement('style')
  style.textContent = stateIds
    .map(
      (id) =>
        `html[data-state="${id}"] [data-show-when]:not([data-show-when~="${id}"]),` +
        `html[data-state="${id}"] [data-hide-when~="${id}"] { display: none !important; }`,
    )
    .join('\n')
  document.head.append(style)

  const params = new URLSearchParams(location.search)
  let notes = params.get('notes') === 'on'
  const embedded = window.parent !== window

  const setState = (id) => {
    root.dataset.state = stateIds.includes(id) ? id : (stateIds[0] ?? '')
  }
  setState(params.get('state'))

  const layer = document.createElement('div')
  layer.className = 'wf-notes'
  document.body.append(layer)

  const badgeText = (ref) => {
    const n = Number(ref)
    // ①〜⑳ だけが Unicode の丸囲みの数字として 1 文字で並ぶ
    return Number.isInteger(n) && n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : ref
  }

  const renderNotes = () => {
    layer.replaceChildren()
    if (!notes) return
    const scale = Number(getComputedStyle(root).getPropertyValue('--wf-note-scale')) || 1
    const size = 22 * scale
    const placed = []
    for (const element of document.querySelectorAll('[data-ref]')) {
      if (element.getClientRects().length === 0) continue
      const rect = element.getBoundingClientRect()
      let x = Math.max(0, rect.left + scrollX - size / 2)
      const y = Math.max(0, rect.top + scrollY - size / 2)
      while (placed.some((p) => Math.abs(p.x - x) < size && Math.abs(p.y - y) < size)) x += size + 2
      placed.push({ x, y })

      const badge = document.createElement('button')
      badge.type = 'button'
      badge.className = 'wf-note'
      badge.style.left = `${x}px`
      badge.style.top = `${y}px`
      badge.textContent = badgeText(element.dataset.ref)
      const pop = document.createElement('span')
      pop.className = 'wf-note__pop'
      const name = document.createElement('strong')
      name.textContent = `${element.dataset.ref} ${element.dataset.component ?? ''}`
      const testId = document.createElement('code')
      testId.textContent = `data-testid: ${element.dataset.testid ?? 'なし'}`
      pop.append(name, document.createElement('br'), testId)
      badge.append(pop)
      badge.setAttribute('aria-label', `${name.textContent}、${testId.textContent}`)
      layer.append(badge)
    }
  }

  let timer = 0
  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      renderNotes()
      if (embedded) {
        window.parent.postMessage(
          { source: 'wireframe', type: 'resize', height: Math.ceil(document.body.getBoundingClientRect().height) },
          '*',
        )
      }
    })
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (event.source !== window.parent || data?.source !== 'wireframe-viewer') return
    if (data.type !== 'set') return
    setState(data.state)
    notes = data.notes === true
    root.style.setProperty('--wf-note-scale', String(1 / (Number(data.scale) || 1)))
    refresh()
  })

  new ResizeObserver(refresh).observe(document.body)
  document.addEventListener('change', refresh)
  window.addEventListener('resize', refresh)

  if (embedded) {
    window.parent.postMessage(
      { source: 'wireframe', type: 'ready', title: document.title, states },
      '*',
    )
  }
  refresh()
})()
