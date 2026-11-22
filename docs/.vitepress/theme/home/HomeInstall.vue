<script setup>
import { VPButton } from 'vitepress/theme';
import Install from './Install.md';

// The last section of the home page: the command that adds the library to an app.
defineProps({
  title: { type: String, required: true },
  details: { type: String, required: true },
  linkText: { type: String, required: true },
  link: { type: String, required: true },
});
</script>

<template>
  <section class="home-section home-install">
    <div class="pitch">
      <h2 class="home-title">{{ title }}</h2>
      <p class="home-details">{{ details }}</p>
      <VPButton theme="brand" :text="linkText" :href="link" />
    </div>
    <div class="commands vp-doc">
      <Install />
    </div>
  </section>
</template>

<style scoped>
.home-install {
  display: grid;
  gap: 24px;
  align-items: center;
  padding-block: var(--home-section-gap) calc(var(--home-section-gap) / 2);
}

.commands {
  min-width: 0;
}

.commands :deep(.vp-code-group) {
  margin: 0;
}

@media (min-width: 960px) {
  .home-install {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 64px;
  }
}
</style>
