<script setup>
import { computed } from 'vue';
import { count, differenceLabel, isLevel, rangeLabel, scenarios, scenariosById } from './results';

// Requests per second, two bars per request: nestjs-endpoints in the accent color, the plain
// NestJS controller in gray. Every bar is on one scale, so a bar's length is its throughput
// whichever request it is for, and each is labeled with its name and its number.
const props = defineProps({
  /** The ids of the scenarios to show; all of them when left out. */
  only: { type: Array, default: undefined },
});

const rows = computed(() => (props.only ? scenariosById(props.only) : scenarios));
const longest = Math.max(
  ...scenarios.flatMap(({ endpoints, nest }) => [endpoints.median, nest.median]),
);

const bars = (scenario) => [
  { key: 'endpoints', name: 'nestjs-endpoints', ...scenario.endpoints },
  { key: 'nest', name: 'NestJS', ...scenario.nest },
];
const width = (median) => `${(median / longest) * 100}%`;
const about = (bar) =>
  `${bar.name}: ${count(bar.median)} requests per second (${rangeLabel(bar)} across rounds)`;
</script>

<template>
  <figure class="benchmark">
    <ol>
      <li v-for="scenario in rows" :key="scenario.id">
        <p class="request">
          <span>{{ scenario.label }}</span>
          <span class="difference" :class="{ level: isLevel(scenario) }">
            {{ differenceLabel(scenario) }}
          </span>
        </p>
        <p v-for="bar in bars(scenario)" :key="bar.key" class="measure" :title="about(bar)">
          <span class="name">{{ bar.name }}</span>
          <span class="track"
            ><span class="bar" :class="bar.key" :style="{ width: width(bar.median) }"
          /></span>
          <span class="value">{{ count(bar.median) }}</span>
        </p>
      </li>
    </ol>
    <figcaption>Requests per second on one CPU core. Longer is better.</figcaption>
  </figure>
</template>

<style scoped>
.benchmark {
  margin: 0;
}

ol {
  display: grid;
  gap: 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}

p {
  margin: 0;
}

.request {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.difference {
  flex: none;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--vp-c-brand-soft);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.difference.level {
  background: var(--vp-c-default-soft);
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.measure {
  display: grid;
  grid-template-columns: 9em minmax(0, 1fr) 4em;
  gap: 10px;
  align-items: center;
  padding: 3px 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}

.name {
  white-space: nowrap;
}

.measure:hover {
  color: var(--vp-c-text-1);
}

.track {
  display: block;
}

.bar {
  display: block;
  height: 12px;
  border-radius: 0 4px 4px 0;
}

.bar.endpoints {
  background: var(--benchmark-endpoints);
}

.bar.nest {
  background: var(--benchmark-nest);
}

.value {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

figcaption {
  margin-top: 16px;
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}

@media (max-width: 480px) {
  .measure {
    grid-template-columns: 9em minmax(0, 1fr) 3.6em;
    gap: 8px;
    font-size: 12px;
  }
}
</style>
