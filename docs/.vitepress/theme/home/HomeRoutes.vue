<script setup>
import { VPButton } from 'vitepress/theme';

// A folder of endpoint files beside the route and the client call each one becomes. `rows` is
// the tree, top to bottom: `{ file, depth, method?, path?, client?, note? }`. A row with no `path`
// is not an endpoint, and shows its `note`.
defineProps({
  title: { type: String, required: true },
  details: { type: String, required: true },
  linkText: { type: String, default: '' },
  link: { type: String, default: '' },
  columns: { type: Object, required: true },
  rows: { type: Array, required: true },
});
</script>

<template>
  <section class="home-section home-routes">
    <h2 class="home-title">{{ title }}</h2>
    <p class="home-details">{{ details }}</p>
    <div class="tree" role="table">
      <div class="row head" role="row">
        <span role="columnheader">{{ columns.file }}</span>
        <span role="columnheader">{{ columns.route }}</span>
        <span role="columnheader">{{ columns.client }}</span>
      </div>
      <div
        v-for="row in rows"
        :key="row.file + row.depth"
        class="row"
        :class="{ plain: !row.path }"
        role="row"
      >
        <span class="file" role="cell" :style="{ paddingLeft: `${row.depth * 20}px` }">{{
          row.file
        }}</span>
        <template v-if="row.path">
          <span class="route" role="cell">
            <span class="method">{{ row.method }}</span>
            {{ row.path }}
          </span>
          <span class="client" role="cell">{{ row.client }}</span>
        </template>
        <span v-else class="note" role="cell">{{ row.note }}</span>
      </div>
    </div>
    <VPButton v-if="link" theme="alt" :text="linkText" :href="link" />
  </section>
</template>

<style scoped>
.home-routes {
  padding-bottom: var(--home-section-gap);
}

.home-details {
  max-width: 720px;
  margin-bottom: 24px;
}

.tree {
  margin-bottom: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 20px;
  overflow: hidden;
}

/* A phone stacks a file's route and client call under it; wider screens use three columns. */
.row {
  display: grid;
  gap: 2px 24px;
  padding: 10px 18px;
  border-top: 1px solid var(--vp-c-divider);
}

.row.head {
  display: none;
  border-top: 0;
  font-family: var(--vp-font-family-base);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.row.head + .row {
  border-top: 0;
}

.file {
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.plain .file {
  color: var(--vp-c-text-2);
}

.route,
.client {
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.method {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.note {
  font-family: var(--vp-font-family-base);
  color: var(--vp-c-text-3);
}

@media (min-width: 960px) {
  .row,
  .row.head {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 5fr) minmax(0, 4fr);
  }

  .row.head + .row {
    border-top: 1px solid var(--vp-c-divider);
  }

  .note {
    grid-column: 2 / -1;
  }
}
</style>
