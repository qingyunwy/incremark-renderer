import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';

import StreamingShowcase from './components/StreamingShowcase.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('StreamingShowcase', StreamingShowcase);
  },
} satisfies Theme;
