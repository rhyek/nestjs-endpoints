<!--
  One column of a flow diagram: what happens, top to bottom, as a page writes it in Markdown.
  Its content is a title in bold, then a list of phases, each with a numbered list of the steps
  it runs in order:

    <FlowLane>

    **Startup**

    - `onModuleInit()`
      1. <Owner parent>teams</Owner> router
      2. <Owner child>$teamId</Owner> router

    </FlowLane>

  The steps are numbered through the whole lane, from 1, or from `start` where a lane goes on
  from the one beside it. All of it is the component's content, so the Markdown copy of a page
  (llms.txt) keeps it as the lists it is written as.
-->
<script setup>
defineProps({ start: { type: Number, default: 1 } });
</script>

<template>
  <section class="lane" :style="{ counterReset: `step ${start - 1}` }"><slot /></section>
</template>

<style scoped>
.lane {
  padding: 14px 16px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

/* The title. */
.lane :deep(> p) {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.lane :deep(> p strong) {
  font-weight: inherit;
}

/* A title that is a URL or code keeps its own case. */
.lane :deep(> p code) {
  padding: 0;
  background: none;
  font-size: 13px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--vp-c-text-1);
}

/* The phases. */
.lane :deep(> ul) {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lane :deep(> ul > li) {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.lane :deep(> ul > li > code) {
  padding: 0;
  background: none;
  font-size: 13px;
  color: var(--vp-c-text-1);
}

/* A phase's steps: numbers on a line that runs from its first step to its last. */
.lane :deep(ol) {
  margin: 8px 0 0 11px;
  padding: 0;
  border-left: 1px solid var(--vp-c-border);
  list-style: none;
}

.lane :deep(ol > li) {
  counter-increment: step;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 0 -11px;
  font-size: 13px;
  line-height: 22px;
  font-weight: 400;
  color: var(--vp-c-text-2);
}

.lane :deep(ol > li + li) {
  margin-top: 6px;
}

.lane :deep(ol > li::before) {
  content: counter(step);
  flex: none;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  border: 1px solid var(--vp-c-border);
  border-radius: 50%;
  background: var(--vp-c-bg);
  font-size: 11px;
  line-height: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--vp-c-text-2);
}

.lane :deep(ol code) {
  padding: 0;
  background: none;
  font-size: 13px;
  color: var(--vp-c-text-1);
}

/* A phase with no steps of its own: what follows, in a line. */
.lane :deep(> ul > li:not(:has(ol))) {
  font-weight: 500;
  color: var(--vp-c-text-2);
}
</style>
