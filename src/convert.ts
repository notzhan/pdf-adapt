import { PDFDocument, type PDFPage } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type Mode = 'ipad' | 'eink'
export type Split = 'smart' | 'half'
export interface Options {
  mode: Mode
  gutter: number
  margin: number
  bookSpread: boolean
  trimX: number
  trimY: number
  left: number
  right: number
  top: number
  bottom: number
  split: Split
}
export type Progress = (done: number, total: number, message: string) => void

type Box = { left: number; bottom: number; right: number; top: number }

function finiteNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} 必须是非负数。`)
}

function pageBox(page: PDFPage): Box {
  if (page.getRotation().angle % 360 !== 0) {
    throw new Error('暂不支持带 PDF 页面旋转标记的文件；请先将页面旋转固化后重试。')
  }
  const crop = page.getCropBox()
  return { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height }
}

function size(box: Box): { width: number; height: number } {
  return { width: box.right - box.left, height: box.top - box.bottom }
}

function validateTrim(box: Box, options: Options): Box {
  const left = options.trimX + options.left
  const right = options.trimX + options.right
  const top = options.trimY + options.top
  const bottom = options.trimY + options.bottom
  const trimmed = {
    left: box.left + left,
    bottom: box.bottom + bottom,
    right: box.right - right,
    top: box.top - top,
  }
  if (size(trimmed).width < 20 || size(trimmed).height < 40) {
    throw new Error('裁剪后页面过小。请减小四边裁剪值。')
  }
  return trimmed
}

function chooseCut(lines: Array<[number, number]>, top: number, bottom: number): number {
  const middle = (top + bottom) / 2
  const halfWindow = (top - bottom) * 0.12
  const low = middle - halfWindow
  const high = middle + halfWindow
  const candidates = [low, high, middle]
  for (const [a, b] of lines) {
    candidates.push(Math.max(low, Math.min(high, a)))
    candidates.push(Math.max(low, Math.min(high, b)))
  }
  let best = middle
  let bestScore = -Infinity
  for (const candidate of candidates) {
    // PDF y increases upward. A 1.5 pt buffer around each text box helps
    // avoid antialiased glyph edges on the dividing line.
    const clearance = lines.reduce((nearest, [a, b]) => {
      const distance = candidate < a ? a - candidate : candidate > b ? candidate - b : 0
      return Math.min(nearest, distance)
    }, Infinity)
    const score = Math.min(clearance, 24) - Math.abs(candidate - middle) * 0.16
    if (score > bestScore) { bestScore = score; best = candidate }
  }
  return bestScore >= 1.5 ? best : middle
}

async function textIntervals(page: pdfjs.PDFPageProxy, box: Box): Promise<Array<[number, number]>> {
  const viewport = page.getViewport({ scale: 1, rotation: 0 })
  const intervals: Array<[number, number]> = []
  // PDF.js getTextContent() uses `for await` on a ReadableStream. Safari
  // versions without ReadableStream async iteration throw at that point.
  // Reading chunks directly is also gentler on memory for large pages.
  const reader = page.streamTextContent().getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const item of value.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const transform = pdfjs.Util.transform(viewport.transform, item.transform)
        const height = Math.max(1, Math.hypot(transform[2], transform[3]))
        const yTop = transform[5] - height
        const yBottom = transform[5]
        // PDF.js viewport is top-down; map it into the source crop box.
        const lower = box.top - yBottom * size(box).height / viewport.height
        const upper = box.top - yTop * size(box).height / viewport.height
        intervals.push([Math.min(lower, upper) - 1.5, Math.max(lower, upper) + 1.5])
      }
    }
  } finally {
    reader.releaseLock()
  }
  return intervals
}

export async function inspect(file: File): Promise<number> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
  try {
    const doc = await task.promise
    return doc.numPages
  } finally {
    await task.destroy()
  }
}

export async function convert(file: File, options: Options, progress: Progress): Promise<Uint8Array> {
  for (const [label, value] of Object.entries(options)) {
    if (typeof value === 'number') finiteNonnegative(value, label)
  }
  const source = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false })
  if (source.isEncrypted) throw new Error('暂不支持加密 PDF。')
  const output = await PDFDocument.create()
  output.setTitle(`${file.name.replace(/\.pdf$/i, '')} – ${options.mode}`)
  const pages = source.getPages()
  if (pages.length === 0) throw new Error('PDF 没有页面。')
  let analysis: pdfjs.PDFDocumentProxy | undefined
  let task: pdfjs.PDFDocumentLoadingTask | undefined
  try {
    if (options.mode === 'eink' && options.split === 'smart') {
      progress(0, pages.length, '正在读取文字位置…')
      // PDF.js transfers its input buffer to its worker. Keep this separate
      // from pdf-lib's input and load it only for smart splitting.
      task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true })
      analysis = await task.promise
    }
    if (options.mode === 'ipad') {
      const groups: Array<[number | null, number | null]> = []
      let index = 0
      if (options.bookSpread) { groups.push([null, 0]); index = 1 }
      while (index < pages.length) { groups.push([index, index + 1 < pages.length ? index + 1 : null]); index += 2 }
      for (let i = 0; i < groups.length; i++) {
        const [leftIndex, rightIndex] = groups[i]
        const leftBox = leftIndex === null ? null : pageBox(pages[leftIndex])
        const rightBox = rightIndex === null ? null : pageBox(pages[rightIndex])
        const slotWidth = Math.max(leftBox ? size(leftBox).width : 0, rightBox ? size(rightBox).width : 0)
        const slotHeight = Math.max(leftBox ? size(leftBox).height : 0, rightBox ? size(rightBox).height : 0)
        const out = output.addPage([slotWidth * 2 + options.gutter + options.margin * 2, slotHeight + options.margin * 2])
        for (const [pageIndex, box, slot] of [[leftIndex, leftBox, 0], [rightIndex, rightBox, 1]] as const) {
          if (pageIndex === null || box === null) continue
          const embedded = await output.embedPage(pages[pageIndex], box)
          const dimensions = size(box)
          out.drawPage(embedded, {
            x: options.margin + slot * (slotWidth + options.gutter) + (slotWidth - dimensions.width) / 2,
            y: options.margin + (slotHeight - dimensions.height) / 2,
            width: dimensions.width,
            height: dimensions.height,
          })
        }
        progress(i + 1, groups.length, `已完成 ${i + 1} / ${groups.length} 张跨页`)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    } else {
      for (let i = 0; i < pages.length; i++) {
        const box = validateTrim(pageBox(pages[i]), options)
        const cut = analysis
          ? chooseCut(await textIntervals(await analysis.getPage(i + 1), pageBox(pages[i])), box.top, box.bottom)
          : (box.top + box.bottom) / 2
        for (const part of [{ ...box, bottom: cut }, { ...box, top: cut }]) {
          const dimensions = size(part)
          const embedded = await output.embedPage(pages[i], part)
          const out = output.addPage([dimensions.width, dimensions.height])
          out.drawPage(embedded, { x: 0, y: 0, width: dimensions.width, height: dimensions.height })
        }
        progress(i + 1, pages.length, `已完成 ${i + 1} / ${pages.length} 页`)
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    progress(1, 1, '正在保存 PDF…')
    return await output.save({ useObjectStreams: true })
  } finally {
    if (task) await task.destroy()
  }
}
