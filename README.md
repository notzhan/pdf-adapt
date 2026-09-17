# PDF Adapt

纯浏览器 PDF 排版工具。选择本地 PDF，生成适合 iPad / GoodNotes 的双页跨页，或适合 E-Ink 横屏阅读的上下拆分页。所有文件处理均在浏览器本地执行，页面没有上传接口。

## 本地运行

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

打开终端显示的本地地址。生产构建：

```bash
npm run build
npm run preview
```

构建输出在 `dist/`。`vite.config.ts` 设置相对资源路径，因此部署在 GitHub Pages 的仓库子路径时也能加载脚本和样式。

## 使用

1. 选择 PDF，页面显示文件名、大小和页数。
2. 选择转换目标和参数，点击“生成 PDF”。
3. 等待进度完成，再点击下载按钮。

**iPad / GoodNotes**：默认按第 1+2、3+4 页左右拼接。`gutter` 是中缝宽度，`margin` 是整张跨页四周的外边距，单位均为 PDF point（72 pt = 1 英寸）。选择“书籍跨页”后顺序为“空白+第 1 页、第 2+3 页……”；末尾不足一页时另一侧留白。原页按原尺寸居中放在各自的版面槽内。

**E-Ink**：每张原页先裁掉边缘，再拆为上、下两张。`trim-x` 同时作用于左右两边，`trim-y` 同时作用于上下两边；展开四边设置后，各边的数值会**叠加**到统一裁剪值。固定 50% 从裁剪后页面中点拆开。智能切割在中点上下约页面高度 12% 的范围内，根据 PDF.js 读取的文字位置寻找行间空白。

智能切割只分析文字框；扫描版 PDF、图片、图表、复杂多栏版式可能被切开。可尝试固定 50% 或先用别的工具处理源文件。带页面旋转标记的 PDF 当前会明确报错，请先将旋转固化。加密文件无法处理。

## GitHub Pages 部署

1. 新建 GitHub 仓库，将本项目文件放在仓库根目录并推送到 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment** 中将 **Source** 设为 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 会在每次推送 `main` 后执行 `npm ci`、构建并发布 `dist/`。也可从 Actions 页面手动运行。
4. 部署完成后访问 Pages 给出的地址，通常为 `https://用户名.github.io/仓库名/`。

## 隐私与内存

PDF 通过文件选择器进入当前浏览器，转换使用 `pdf-lib`，智能文字分析使用 `pdfjs-dist`。没有后端、上传请求或远程 PDF 服务。首次加载网页及依赖资源仍会从 GitHub Pages 下载。

浏览器需要在内存中保存原 PDF 和输出 PDF；智能模式还需要给 PDF.js worker 一份输入数据，因此大文件可能因设备内存不足而失败。建议先处理较小文件，或关闭其他标签页。此应用不会把 PDF 写入云端，下载前的结果仅以本地 Blob URL 保留在当前页面中。

## 技术说明

Vite + TypeScript；`pdf-lib` 嵌入原 PDF 页面的裁剪区域，保留文本、矢量与图片的原有分辨率；`pdfjs-dist` 只负责页数和智能切割的文字位置分析。输出时不会先将页面渲染成位图。
