<script setup>
import { VPButton } from 'vitepress/theme';
import CodeWindow from './CodeWindow.vue';
import HeroEndpoint from './HeroEndpoint.md';
// The icon at its full size (logo/logo.svg). The build inlines it into the page.
import logo from '../../../../logo/logo.svg';

// The top of the home page: what the library is, beside one whole endpoint file, and under them
// what that one file gives an app. `intro` is the home page's frontmatter of that name.
defineProps({
  intro: { type: Object, required: true },
});
</script>

<template>
  <section class="home-section home-hero">
    <div class="top">
      <div class="pitch">
        <h1>
          <span class="brand">
            <img class="icon" :src="logo" alt="" width="48" height="48" />
            <span class="name">{{ intro.name }}</span>
          </span>
          <span class="text">{{ intro.text }}</span>
        </h1>
        <p class="tagline">{{ intro.tagline }}</p>
        <div class="actions">
          <VPButton
            v-for="action in intro.actions"
            :key="action.link"
            :theme="action.theme"
            :text="action.text"
            :href="action.link"
          />
        </div>
      </div>
      <CodeWindow :file="intro.file">
        <HeroEndpoint />
      </CodeWindow>
    </div>
    <div class="yields">
      <p class="lead">{{ intro.yieldsLead }}</p>
      <ul>
        <li v-for="item in intro.yields" :key="item.label">
          <span class="home-eyebrow">{{ item.label }}</span>
          <code>{{ item.value }}</code>
          <span class="details">{{ item.details }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  padding-block: 40px 56px;
}

.top {
  display: grid;
  gap: 32px;
  align-items: center;
}

h1 {
  display: flex;
  flex-direction: column;
  gap: 4px;
  letter-spacing: -0.02em;
  font-weight: 700;
}

/* The icon and the name, on one line. */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* The tile is nearly the dark page's own color, so a short, even shadow keeps its shape there. It is
   a drop-shadow, which follows the tile's own corners; a border-radius here would clip them. */
.icon {
  flex: none;
  width: 34px;
  height: 34px;
  filter: drop-shadow(0 0 2.5px rgb(0 0 0 / 0.4));
}

.name {
  width: fit-content;
  font-size: 32px;
  line-height: 40px;
  background: var(--vp-home-hero-name-background);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.text {
  font-size: 32px;
  line-height: 40px;
  color: var(--vp-c-text-1);
}

.tagline {
  margin-top: 16px;
  max-width: 560px;
  font-size: 18px;
  line-height: 28px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.yields {
  margin-top: 40px;
}

.lead {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.yields ul {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.yields li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.yields code {
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}

.details {
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-2);
}

@media (min-width: 640px) {
  .home-hero {
    padding-block: 56px 64px;
  }

  .brand {
    gap: 12px;
  }

  .icon {
    width: 44px;
    height: 44px;
  }

  .name,
  .text {
    font-size: 44px;
    line-height: 52px;
  }

  .tagline {
    font-size: 20px;
    line-height: 32px;
  }

  .yields ul {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 960px) {
  .home-hero {
    padding-block: 72px;
  }

  .top {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: 48px;
  }

  .yields ul {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1152px) {
  .icon {
    width: 48px;
    height: 48px;
  }

  .name,
  .text {
    font-size: 48px;
    line-height: 56px;
  }
}
</style>
