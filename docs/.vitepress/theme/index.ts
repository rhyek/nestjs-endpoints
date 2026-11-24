// Linted on its own (pre-commit), this file sees no shim unless it names it: `.vue` imports need it.
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./vue-shim.d.ts" />
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import type { EnhanceAppContext } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Endpoint from './Endpoint.vue';
import FlowLane from './flows/FlowLane.vue';
import FlowPair from './flows/FlowPair.vue';
import Owner from './flows/Owner.vue';
import Layout from './Layout.vue';
import BenchmarkChart from './performance/BenchmarkChart.vue';
import BenchmarkStats from './performance/BenchmarkStats.vue';
import BenchmarkTable from './performance/BenchmarkTable.vue';
import RequestPipeline from './performance/RequestPipeline.vue';
import '@shikijs/vitepress-twoslash/style.css';
import './custom.css';

// The default theme, with the home page's own sections (see Layout.vue), the accent color
// changed (see custom.css), the popups that show a code sample's types (Twoslash), the word
// "endpoint" set apart where a page compares one with a controller (see Endpoint.vue), the
// benchmark results as components a page can place (see ./performance), and the diagrams of what
// runs in which order, which a page writes as lists (see ./flows).
export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
    app.component('Endpoint', Endpoint);
    app.component('Owner', Owner);
    app.component('FlowLane', FlowLane);
    app.component('FlowPair', FlowPair);
    app.component('RequestPipeline', RequestPipeline);
    app.component('BenchmarkChart', BenchmarkChart);
    app.component('BenchmarkStats', BenchmarkStats);
    app.component('BenchmarkTable', BenchmarkTable);
  },
};
