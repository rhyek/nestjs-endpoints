<script setup>
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import CodeWindow from './home/CodeWindow.vue';
import HomeHero from './home/HomeHero.vue';
import HomeInstall from './home/HomeInstall.vue';
import HomeRoutes from './home/HomeRoutes.vue';
import HomeRow from './home/HomeRow.vue';
import LineageChild from './home/LineageChild.md';
import LineageEndpoint from './home/LineageEndpoint.md';
import LineageParent from './home/LineageParent.md';
import StillNest from './home/StillNest.md';
import TestIt from './home/TestIt.md';
import TypedClient from './home/TypedClient.md';
import TypedHandler from './home/TypedHandler.md';
import BenchmarkChart from './performance/BenchmarkChart.vue';
import { headline } from './performance/results';

// The home page's words are its frontmatter (docs/index.md), one key per section below. Its code
// samples are the Markdown files in ./home, so they are highlighted and type-checked like any
// page's.
const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <HomeHero v-if="frontmatter.intro" :intro="frontmatter.intro" />
    </template>
    <template #home-features-before>
      <template v-if="frontmatter.types">
        <HomeRow v-bind="frontmatter.types.handler">
          <TypedHandler />
        </HomeRow>
        <HomeRow v-bind="frontmatter.types.client" flip>
          <div class="home-client">
            <TypedClient />
          </div>
        </HomeRow>
      </template>
      <HomeRow v-if="frontmatter.context" v-bind="frontmatter.context.row">
        <template #visual>
          <div class="home-context">
            <CodeWindow :file="frontmatter.context.files.parent">
              <LineageParent />
            </CodeWindow>
            <CodeWindow :file="frontmatter.context.files.child">
              <LineageChild />
            </CodeWindow>
            <CodeWindow :file="frontmatter.context.files.endpoint">
              <LineageEndpoint />
            </CodeWindow>
          </div>
        </template>
      </HomeRow>
      <HomeRow v-if="frontmatter.testing" v-bind="frontmatter.testing" flip>
        <TestIt />
      </HomeRow>
      <HomeRow v-if="frontmatter.nest" v-bind="frontmatter.nest">
        <StillNest />
      </HomeRow>
      <HomeRow v-if="frontmatter.performance" v-bind="frontmatter.performance" flip>
        <template #visual>
          <div class="home-benchmark">
            <BenchmarkChart :only="headline" />
          </div>
        </template>
      </HomeRow>
      <HomeRoutes v-if="frontmatter.routes" v-bind="frontmatter.routes" />
      <h2 v-if="frontmatter.featuresTitle" class="home-section home-title home-features-title">
        {{ frontmatter.featuresTitle }}
      </h2>
    </template>
    <template #home-features-after>
      <HomeInstall v-if="frontmatter.install" v-bind="frontmatter.install" />
    </template>
  </Layout>
</template>

<style scoped>
.home-features-title {
  padding-bottom: 24px;
}

/* A router's file, over its child's, over the endpoint's that both type. */
.home-context {
  display: grid;
  gap: 16px;
}

/*
 * Twoslash leaves room under a sample for a completion list, as if the list opened on its last
 * line. This one opens four lines up, inside the code, so it needs only what is left over.
 */
.home-client :deep(pre) {
  padding-bottom: 48px !important;
}

.home-benchmark {
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
</style>
