# Tab Stack

Chrome 标签页「压栈」扩展 — 用快捷键把标签页按域名合并成栈，再一键弹出。解决 Chrome 开 50+ 标签页找不到的问题。

![manifest version](https://img.shields.io/badge/manifest-v3-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## 功能

- **按域名压栈** — 把同一域名下的所有标签页（保留当前活动页）关闭并存入栈
- **一键压栈全部** — 除当前标签页外，将所有打开的标签按域名分类压栈
- **一键恢复** — 从 Saved Stacks 区域点击 ↩ 恢复整组标签
- **Undo 恢复** — 恢复后 3.5 秒内可撤销
- **搜索过滤** — 弹窗打开即聚焦搜索框，实时过滤域名和标签标题
- **组管理** — 对已保存的栈重命名、删除整组、删除单条
- **空组自动清理** — 没有内容的域名组不显示
- **栈深度可视化** — 左侧琥珀色条形直观展示各域名的标签堆积程度
- **徽章计数** — 扩展图标实时显示已压栈标签总数

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌥⇧S` (Alt+Shift+S) | 压栈当前域名的所有标签页 |
| `⌥⇧D` (Alt+Shift+D) | 打开弹窗并聚焦搜索框 |

> 如快捷键冲突，可在 `chrome://extensions/shortcuts` 手动修改。

## 安装

目前需要以「开发者模式」手动安装：

1. 克隆或下载本仓库
   ```bash
   git clone git@github.com:lyloou/tab-stack.git
   ```
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本仓库目录
5. 扩展图标出现在工具栏，即可使用

## 文件结构

```
tab-stack/
├── manifest.json    # 扩展配置（MV3）
├── background.js    # Service Worker：压栈/恢复逻辑、快捷键处理
├── popup.html       # 弹窗 UI
├── popup.js         # 弹窗交互逻辑
└── README.md
```

## License

MIT
