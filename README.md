# PDF Adapt

一个在浏览器中运行的 PDF 页面适配工具。它可以把竖版 PDF 拼成适合 iPad / GoodNotes 阅读与批注的横向跨页，也可以把每页拆成上下两页，方便在横屏 E-Ink 墨水屏上阅读。

**在线使用：[notzhan.github.io/pdf-adapt](https://notzhan.github.io/pdf-adapt/)**

无需安装软件，也无需注册。选择本地 PDF、调整参数、点击“生成 PDF”，完成后直接下载。

## 功能

### iPad / GoodNotes

- 将相邻两页左右拼成一张横向 PDF 页面，默认顺序为第 1+2、3+4 页。
- 可调整中缝（`gutter`）和四周外边距（`margin`）。
- 可启用书籍跨页：先“空白 + 第 1 页”，再“第 2 + 3 页”，依此类推。最后不足一页时自动留白。

### E-Ink 墨水屏

- 将每张原 PDF 页面拆成上、下两张输出页面。
- 可用 `trim-x` / `trim-y` 统一裁剪左右、上下白边，也可以单独调整四边。单独裁剪值会叠加在统一裁剪值上。
- 可选固定 50% 切割，或智能切割。智能模式读取 PDF 中的文字位置，在页面中部附近寻找行间空白，尽量避免切开文字行。

尺寸参数的单位是 PDF point（pt），**72 pt = 1 英寸**。输出页面保留原 PDF 的文字、矢量图和图片，不先转换成低分辨率位图。

## 使用方法

1. 打开[在线页面](https://notzhan.github.io/pdf-adapt/)，选择或拖入本地 PDF。页面会显示文件名、大小和页数。
2. 选择 iPad 或 E-Ink 模式，按需调整参数。
3. 点击“生成 PDF”，等待进度完成，然后点击下载按钮。

智能切割主要依据文字位置判断。扫描版 PDF、图片、图表及复杂多栏排版仍可能在切割处被分开。遇到这类页面，可以改用固定 50% 切割，或先处理原文件。当前不支持加密 PDF，以及带页面旋转标记的 PDF。

## 本地处理与隐私

**所选 PDF 全程只在当前浏览器中处理，不上传到服务器。** 项目没有后端或 PDF 上传接口。网页代码从 GitHub Pages 加载；文件读取、文字分析、PDF 生成和下载都在本机完成。下载前的结果暂存在当前页面的本地 Blob URL 中，关闭页面后不会由本工具保留。

处理大文件时，浏览器需要为原文件和输出文件分配内存；智能模式还需要给 PDF.js 的工作线程一份输入数据。如果浏览器内存不足，转换可能失败。可以关闭其他标签页后重试，或先拆分原 PDF。

## 开发与部署

项目使用 Vite + TypeScript、[pdf-lib](https://pdf-lib.js.org/) 和 [PDF.js](https://mozilla.github.io/pdf.js/)。需要 Node.js 22 或更新版本：

```bash
npm install
npm run dev
```

运行 `npm run build` 构建，`npm run preview` 预览构建结果。推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages；首次使用新仓库时需在仓库设置中启用 Pages，并将发布来源设为 **GitHub Actions**。Vite 使用相对资源路径，可部署在仓库子路径下。
