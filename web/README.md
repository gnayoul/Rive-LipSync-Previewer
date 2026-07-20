# web — shadcn 重构版（功能块架构）

对照 `docs/shadcn-patterns.md` 与官网 `apps/v4` 示例组合，**不是**只堆默认 Button/Card。

## 运行

**窗口 A — 后端（TTS + vendor）**

```powershell
cd C:\Users\Yung\Desktop\Work\Rive-LipSync-Previewer
.\start.bat
```

**窗口 B — 前端**

```powershell
cd C:\Users\Yung\Desktop\Work\Rive-LipSync-Previewer\web
npm run dev
```

打开 http://localhost:5173  

旧版单页仍在根目录：http://localhost:3921

## 结构

```text
src/components/ui/*       原子组件（shadcn）
src/components/blocks/*   功能块（对照官网组合套路）
src/components/Previewer.tsx  页面组装 + 业务接线
docs/shadcn-patterns.md   模式报告（必读）
```

改 UI 时：先打开模式报告里的官网源码路径，再改对应 `blocks/*`。
