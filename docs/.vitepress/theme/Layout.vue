<script setup>
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import ClientError from './home/ClientError.md';
import CodeWindow from './home/CodeWindow.vue';
import ContextEndpoint from './home/ContextEndpoint.md';
import ContextRouter from './home/ContextRouter.md';
import HomeHero from './home/HomeHero.vue';
import HomeInstall from './home/HomeInstall.vue';
import HomeRoutes from './home/HomeRoutes.vue';
import HomeRow from './home/HomeRow.vue';
import StillNest from './home/StillNest.md';
import TypedClient from './home/TypedClient.md';
import TypedHandler from './home/TypedHandler.md';
import WrongResponse from './home/WrongResponse.md';
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
        <HomeRow v-bind="frontmatter.types.response" flip>
          <WrongResponse />
        </HomeRow>
        <HomeRow v-bind="frontmatter.types.client">
          <ClientError />
          <TypedClient />
        </HomeRow>
      </template>
      <HomeRow v-if="frontmatter.nest" v-bind="frontmatter.nest" flip>
        <StillNest />
      </HomeRow>
      <HomeRow v-if="frontmatter.performance" v-bind="frontmatter.performance">
        <template #visual>
          <div class="home-benchmark">
            <BenchmarkChart :only="headline" />
          </div>
        </template>
      </HomeRow>
      <HomeRoutes v-if="frontmatter.routes" v-bind="frontmatter.routes" />
      <HomeRow v-if="frontmatter.context" v-bind="frontmatter.context.row" flip>
        <template #visual>
          <div class="home-context">
            <CodeWindow :file="frontmatter.context.files.router">
              <ContextRouter />
            </CodeWindow>
            <CodeWindow :file="frontmatter.context.files.endpoint">
              <ContextEndpoint />
            </CodeWindow>
          </div>
        </template>
      </HomeRow>
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

/* The router's file over the endpoint's that it types. */
.home-context {
  display: grid;
  gap: 16px;
}

.home-benchmark {
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}
</style>
