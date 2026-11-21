<script setup>
// A code sample framed as a file: its path in a title bar, the highlighted block under it.
defineProps({
  /** The file's path, or any other label for what the sample is. */
  file: { type: String, default: '' },
});
</script>

<template>
  <div class="code-window">
    <div v-if="file" class="bar">
      <span class="file">{{ file }}</span>
    </div>
    <div class="body vp-doc">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.code-window {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-code-block-bg);
  box-shadow: var(--vp-shadow-2);
  overflow: hidden;
}

.bar {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.file {
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 18px;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

/* The block fills the window, on a phone too: no margin, corners or language label of its own. */
.body :deep(div[class*='language-']) {
  margin: 0;
  border-radius: 0;
  background: transparent;
}

.body :deep(div[class*='language-'] > span.lang) {
  display: none;
}

.body :deep(pre) {
  padding: 16px 0;
}

.body :deep(code) {
  font-size: 13px;
  line-height: 1.6;
}

/* A second block in the same window (one sample, then another) sits under a rule. */
.body :deep(div[class*='language-'] + div[class*='language-']) {
  border-top: 1px solid var(--vp-c-divider);
}
</style>
