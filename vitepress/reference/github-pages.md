# GitHub Pages 部署

这个仓库已经补好了基于 GitHub Actions 的 VitePress Pages 部署链路。

## 文档目录

- 文档源码：`vitepress/`
- VitePress 配置：`vitepress/.vitepress/config.mts`
- 主题扩展：`vitepress/.vitepress/theme/`
- Pages workflow：`.github/workflows/deploy-docs.yml`

## 本地开发

```bash
npm run docs:dev
```

这个命令会先：

1. 构建库产物 `dist/`
2. 启动 VitePress 开发服务器

## 本地构建

```bash
npm run docs:build
```

最终产物会输出到：

```text
vitepress/.vitepress/dist
```

## GitHub Pages workflow 做了什么

workflow 会在 `main` 分支 push 或手动触发时：

1. 安装依赖
2. 执行 `npm run docs:build`
3. 上传 `vitepress/.vitepress/dist`
4. 部署到 GitHub Pages

## 仓库设置建议

在 GitHub 仓库设置里确认：

- `Settings -> Pages -> Build and deployment`
- Source 选择 `GitHub Actions`

## 关于内嵌演示

文档页中的演示组件直接在 VitePress 站点内部运行，并在构建阶段打包当前仓库的 `dist/index.js`。

这意味着：

- 根目录 `demo/` 可以继续独立存在
- 文档站不需要额外同步 demo 静态资源
- GitHub Pages 上的演示效果会跟随文档站一起发布
