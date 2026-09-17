import './style.css'
import { convert, inspect, type Mode, type Options } from './convert'

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="shell">
    <header class="hero"><div class="eyebrow">PDF ADAPT · LOCAL FIRST</div><h1>让 PDF 适合你的屏幕</h1><p>为 iPad 拼接跨页，或为墨水屏拆分页面。文件只在当前浏览器处理。</p></header>
    <section class="card">
      <label class="drop" id="drop"><input id="file" type="file" accept="application/pdf,.pdf" /><span class="drop-icon">↥</span><strong>选择 PDF 文件</strong><span>或将文件拖到这里</span></label>
      <div class="fileinfo" id="fileinfo" hidden></div>
      <div class="section-title">转换目标</div>
      <div class="modes"><label class="mode"><input type="radio" name="mode" value="ipad" checked /><span><b>iPad / GoodNotes</b><small>相邻两页左右拼接</small></span></label><label class="mode"><input type="radio" name="mode" value="eink" /><span><b>E-Ink 墨水屏</b><small>每页拆成上下两页</small></span></label></div>
      <div id="ipad-options" class="options"><div class="grid"><label>中缝 gutter <span>pt</span><input id="gutter" type="number" min="0" step="1" value="0" /></label><label>外边距 margin <span>pt</span><input id="margin" type="number" min="0" step="1" value="0" /></label></div><label class="check"><input id="book" type="checkbox" />书籍跨页：先空白 + 第 1 页，再第 2 + 3 页</label></div>
      <div id="eink-options" class="options" hidden><div class="grid"><label>左右统一裁剪 trim-x <span>pt / 边</span><input id="trimx" type="number" min="0" step="1" value="0" /></label><label>上下统一裁剪 trim-y <span>pt / 边</span><input id="trimy" type="number" min="0" step="1" value="0" /></label></div><details><summary>单独调整四边裁剪</summary><p class="hint">下列值会叠加在统一裁剪上，单位 pt。</p><div class="grid four"><label>左<input id="left" type="number" min="0" step="1" value="0" /></label><label>右<input id="right" type="number" min="0" step="1" value="0" /></label><label>上<input id="top" type="number" min="0" step="1" value="0" /></label><label>下<input id="bottom" type="number" min="0" step="1" value="0" /></label></div></details><div class="split"><label><input type="radio" name="split" value="smart" checked /> 智能切割 <small>参考文字行间空白</small></label><label><input type="radio" name="split" value="half" /> 固定 50% <small>从裁剪后页面正中切开</small></label></div><p class="hint">智能模式分析文字位置；扫描件、图片和图表可能仍会被切开。</p></div>
      <div id="status" role="status" aria-live="polite"></div><progress id="progress" max="100" value="0" hidden></progress>
      <button id="run" disabled>生成 PDF</button><a id="download" class="download" hidden>下载转换后的 PDF</a>
    </section><footer>本地处理 · 无上传 · 保留 PDF 矢量内容<br />大型 PDF 可能超过浏览器可用内存；建议关闭其他标签页后重试。</footer>
  </main>`

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!
const fileInput = $<HTMLInputElement>('#file')
const run = $<HTMLButtonElement>('#run')
const status = $<HTMLDivElement>('#status')
const progress = $<HTMLProgressElement>('#progress')
const download = $<HTMLAnchorElement>('#download')
let file: File | null = null
let objectUrl: string | null = null
let pageCount: number | null = null

function number(id: string): number {
  const value = Number($<HTMLInputElement>(`#${id}`).value)
  if (!Number.isFinite(value) || value < 0) throw new Error('参数必须是非负数。')
  return value
}
function selected(name: string): string { return $<HTMLInputElement>(`input[name="${name}"]:checked`).value }
function options(): Options {
  return { mode: selected('mode') as Mode, gutter: number('gutter'), margin: number('margin'), bookSpread: $<HTMLInputElement>('#book').checked, trimX: number('trimx'), trimY: number('trimy'), left: number('left'), right: number('right'), top: number('top'), bottom: number('bottom'), split: selected('split') as Options['split'] }
}
function setStatus(message: string, error = false): void { status.textContent = message; status.classList.toggle('error', error) }
function clearDownload(): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = null
  download.hidden = true
  download.removeAttribute('href')
}
async function selectFile(chosen?: File): Promise<void> {
  clearDownload()
  file = null
  pageCount = null
  run.disabled = true
  progress.hidden = true
  const info = $<HTMLDivElement>('#fileinfo')
  info.hidden = true
  if (!chosen) { setStatus(''); return }
  if (!chosen.name.toLowerCase().endsWith('.pdf')) { setStatus('请选择 PDF 文件。', true); return }
  setStatus('正在读取页数…')
  try {
    const count = await inspect(chosen)
    file = chosen
    pageCount = count
    info.textContent = `${chosen.name} · ${count} 页 · ${(chosen.size / 1024 / 1024).toFixed(1)} MB`
    info.hidden = false
    run.disabled = false
    setStatus('文件已就绪。')
  } catch (error) { setStatus(`无法打开 PDF：${message(error)}`, true) }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
fileInput.addEventListener('change', () => void selectFile(fileInput.files?.[0]))
const drop = $<HTMLLabelElement>('#drop')
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging') })
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'))
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void selectFile(event.dataTransfer?.files[0]) })
document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
  const eink = selected('mode') === 'eink'
  $('#ipad-options').hidden = eink
  $('#eink-options').hidden = !eink
  clearDownload()
}))
app.querySelectorAll<HTMLInputElement>('input').forEach(input => {
  if (input.id !== 'file') input.addEventListener('change', clearDownload)
})
run.addEventListener('click', async () => {
  if (!file) return
  clearDownload()
  run.disabled = true
  progress.hidden = false
  progress.value = 0
  const mode = selected('mode')
  try {
    const result = await convert(file, options(), (done, total, label) => {
      progress.value = Math.round(done / total * 100)
      setStatus(label)
    })
    objectUrl = URL.createObjectURL(new Blob([new Uint8Array(result)], { type: 'application/pdf' }))
    download.href = objectUrl
    download.download = `${file.name.replace(/\.pdf$/i, '')}-${mode}.pdf`
    download.hidden = false
    setStatus(`完成：${pageCount} 页原稿已转换。`)
    progress.value = 100
  } catch (error) { setStatus(`转换失败：${message(error)}`, true); progress.hidden = true }
  finally { run.disabled = false }
})
