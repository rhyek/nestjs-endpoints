<script setup>
import { VPButton } from 'vitepress/theme';
import CodeWindow from './CodeWindow.vue';

// One claim about the library beside what shows it: a code sample, which is the default slot,
// or anything else, given as the `visual` slot.
defineProps({
  /** A small label over the title, such as "Server". */
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  details: { type: String, required: true },
  /** Short lines under the details, each `{ term, text }`. */
  points: { type: Array, default: () => [] },
  linkText: { type: String, default: '' },
  link: { type: String, default: '' },
  /** Further buttons beside that one, each `{ text, link }`. */
  moreLinks: { type: Array, default: () => [] },
  /** The label in the sample's title bar. */
  file: { type: String, default: '' },
  /** On a wide screen, the sample on the left and the words on the right. */
  flip: { type: Boolean, default: false },
});
</script>

<template>
  <section class="home-section home-row" :class="{ flip }">
    <div class="pitch">
      <p v-if="eyebrow" class="home-eyebrow">{{ eyebrow }}</p>
      <h2 class="home-title">{{ title }}</h2>
      <p class="home-details">{{ details }}</p>
      <dl v-if="points.length">
        <div v-for="point in points" :key="point.term">
          <dt>
            <code>{{ point.term }}</code>
          </dt>
          <dd>{{ point.text }}</dd>
        </div>
      </dl>
      <p v-if="link" class="links">
        <VPButton theme="alt" :text="linkText" :href="link" />
        <VPButton
          v-for="more in moreLinks"
          :key="more.link"
          theme="alt"
          :text="more.text"
          :href="more.link"
        />
      </p>
    </div>
    <div class="sample">
      <slot name="visual">
        <CodeWindow :file="file">
          <slot />
        </CodeWindow>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.home-row {
  display: grid;
  gap: 24px;
  align-items: center;
  padding-bottom: var(--home-section-gap);
}

.home-eyebrow {
  margin-bottom: 8px;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
}

/* A grid item is as wide as its longest line unless told otherwise: a code sample scrolls. */
.sample {
  min-width: 0;
}

dl {
  display: grid;
  gap: 10px;
  margin: 0 0 24px;
}

dl > div {
  display: grid;
  grid-template-columns: minmax(0, 9.5em) minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
}

dt code {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--vp-c-text-1);
}

dd {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}

@media (min-width: 960px) {
  .home-row {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 64px;
  }

  .home-row.flip {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  }

  .home-row.flip .sample {
    order: -1;
  }
}
</style>
