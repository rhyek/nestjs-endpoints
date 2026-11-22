// Linted on its own (pre-commit), this file sees no shim unless it names it: `.vue` imports need it.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./vue-shim.d.ts" />
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import type { EnhanceAppContext } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import BenchmarkChart from './performance/BenchmarkChart.vue';
import BenchmarkStats from './performance/BenchmarkStats.vue';
import BenchmarkTable from './performance/BenchmarkTable.vue';
import '@shikijs/vitepress-twoslash/style.css';
import './custom.css';

// The default theme, with the home page's own sections (see Layout.vue), the accent color
// changed (see custom.css), the popups that show a code sample's types (Twoslash), and the
// benchmark results as components a page can place (see ./performance).
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
    app.component('BenchmarkChart', BenchmarkChart);
    app.component('BenchmarkStats', BenchmarkStats);
    app.component('BenchmarkTable', BenchmarkTable);
  },
};
