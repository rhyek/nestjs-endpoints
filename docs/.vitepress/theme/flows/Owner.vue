<!--
  Which of a page's three things a step of a diagram belongs to: a router, the router made with
  its child(), or an endpoint under that one. `<Owner parent>teams</Owner>` is the name in that
  one's color, the same wherever the page shows it. The name is the component's content, so the
  Markdown copy of a page (llms.txt) keeps it when the tag is removed.
-->
<script setup>
defineProps({ parent: Boolean, child: Boolean, endpoint: Boolean });
</script>

<template>
  <span class="owner" :class="{ parent, child, endpoint }"><slot /></span>
</template>

<style scoped>
.owner {
  display: inline-block;
  padding: 0 7px;
  border-radius: 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 22px;
  font-weight: 600;
  white-space: nowrap;
}

.parent {
  background: var(--vp-c-indigo-soft);
  color: var(--vp-c-indigo-1);
}

.child {
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
}

/* The accent, as the word "endpoint" is where a page sets one apart. */
.endpoint {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
</style>
