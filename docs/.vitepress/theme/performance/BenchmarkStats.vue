<script setup>
import { count, differenceLabel, scenarios } from './results';

// The headline numbers: the two requests that validate on the way in and out, and the one
// that validates nothing.
const tiles = ['params', 'body', 'none'].map((id) =>
  scenarios.find((scenario) => scenario.id === id),
);
</script>

<template>
  <ul class="stats">
    <li v-for="scenario in tiles" :key="scenario.id">
      <p class="figure">{{ differenceLabel(scenario) }}</p>
      <p class="request">{{ scenario.label }}</p>
      <p class="numbers">
        {{ count(scenario.endpoints.median) }} against {{ count(scenario.nest.median) }} requests
        per second
      </p>
    </li>
  </ul>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin: 24px 0;
  padding: 0;
  list-style: none;
}

li {
  margin: 0;
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

p {
  margin: 0;
}

.figure {
  font-size: 32px;
  line-height: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.request {
  margin-top: 4px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.numbers {
  margin-top: 4px;
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}
</style>
