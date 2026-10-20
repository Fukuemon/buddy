/**
 * 画面仕様書のページに埋め込んだビューア（iframe.wireframe-viewer）の高さを、
 * ビューアが postMessage で送る中身の高さに合わせる。zensical.toml の extra_javascript で読み込む。
 */
window.addEventListener('message', (event) => {
  const data = event.data
  if (data?.source !== 'wireframe-viewer' || data.type !== 'resize') return
  for (const frame of document.querySelectorAll('iframe.wireframe-viewer')) {
    if (frame.contentWindow !== event.source) continue
    // style.height は枠線を含むため、枠線の分を足す
    const border = frame.offsetHeight - frame.clientHeight
    frame.style.height = `${Number(data.height) + border}px`
  }
})
