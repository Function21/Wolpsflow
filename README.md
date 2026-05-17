# Wolpsflow

Wolpsflow 是一个生成式音画体验：前端实时生成 lo-fi 音乐，画布上跟着鼓点和低频脉动的粒子做反应，再配一段从外部 API 拉来的灵感名言。

## 主要特点

- 浏览器内通过 Tone.js + Scribbletune 实时生成音乐场景
- Canvas 粒子系统跟随音频特征（鼓点、低频、climax）做形变和呼吸
- Cloudflare Pages Function 代理 [QuoteSlate](https://github.com/Musheer360/QuoteSlate) 提供名言
- 点击 “Next” 切换新的声场与视觉组合

## 使用方式

1. 打开部署后的页面
2. 点击播放按钮启动音频（首次进入需要用户交互，浏览器策略限制）
3. 点击 “Next” 生成新的声音与视觉组合

## 项目结构

```text
src/
  App.svelte             界面组件，串起音频引擎、可视化、名言加载
  main.ts                Svelte 5 入口
  lib/
    audio.ts             AudioEngine：Tone.js 音色、Scribbletune 音轨、节拍调度
    visualizer.ts        StoryVisualizer：Canvas 粒子 + 多层几何图形渲染
    tracks.ts            预设音轨、prompt 解析、视觉基因生成、名言去重
    api.ts               /api/quote 客户端，含重试与本地回退
    types.ts             共享类型
    math.ts              hash、随机数、调色板辅助
    empty-fs.ts          浏览器构建用的 fs 占位（见 vite.config.ts）
functions/api/quote.js   Cloudflare Pages Function：代理 QuoteSlate
index.html
styles.css
vite.config.ts
tsconfig.json
wrangler.toml
package.json
```

## 本地开发

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173` 即可。

构建：`npm run build`，输出到 `dist/`。

## 部署说明

- 平台：Cloudflare Pages
- 构建命令：`npm run build`
- 输出目录：`dist`
- API 路径：`/api/quote`（由 `functions/api/quote.js` 实现，代理 QuoteSlate）

## 名言数据流

- 前端 `loadQuote()` 请求 `/api/quote`
- Cloudflare Function 调用 `https://quoteslate.vercel.app/api/quotes/random`
- 失败或限流时返回函数内置的 5 条候选
- 浏览器再失败则回退到 `tracks.ts` 中的 20 条本地 quote
- 已展示过的名言通过 `localStorage` 记忆，避免重复
