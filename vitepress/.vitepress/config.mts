import { defineConfig } from 'vitepress';

const productionBase = '/incremark-renderer/';

export default defineConfig({
  lang: 'zh-CN',
  title: 'incremark-renderer',
  description: '面向聊天界面、LLM 产品和流式内容场景的 Markdown 增量渲染器。',
  base: process.env.NODE_ENV === 'production' ? productionBase : '/',
  lastUpdated: true,
  themeConfig: {
    siteTitle: 'incremark-renderer',
    logo: '/logo.svg',
    nav: [
      { text: '说明书', link: '/guide/getting-started' },
      { text: '演示', link: '/demo' },
      { text: 'API 选型', link: '/reference/api-selection' },
      { text: 'GitHub', link: 'https://github.com/qingyunwy/incremark-renderer' },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '核心概念', link: '/guide/core-concepts' },
          { text: '浏览器集成', link: '/guide/browser-integration' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: 'API 选型', link: '/reference/api-selection' },
          { text: 'GitHub Pages 部署', link: '/reference/github-pages' },
        ],
      },
      {
        text: '体验',
        items: [
          { text: '在线演示', link: '/demo' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/qingyunwy/incremark-renderer' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © qingyunwy',
    },
    search: {
      provider: 'local',
    },
  },
  head: [
    ['meta', { name: 'theme-color', content: '#c45b2d' }],
    ['meta', { property: 'og:title', content: 'incremark-renderer' }],
    ['meta', { property: 'og:description', content: 'Streaming Markdown renderer with incremental lexing and partial DOM updates.' }],
  ],
});
