<script setup>
import { scenarios } from './results';

// What a validated request passes through, in a NestJS controller and in an endpoint, side by
// side: one row per step, in the order a request meets them. A step both have is the same box on
// both sides. A step only the controller has is gray on its side, with what it creates and its
// share of the time, and an empty slot on the endpoint's. The interceptor is drawn around the
// steps it wraps.
//
// The request is the `GET` with path and search parameters. Its times are the page's own results;
// what each step creates and its share are what `pnpm bench:breakdown` reports, with the shares
// rounded to five as the page's table has them.
const request = scenarios.find((scenario) => scenario.id === 'params');
const microseconds = ({ median }) => Math.round(1_000_000 / median);

const steps = [
  { name: 'Routing, middleware and guards' },
  {
    name: 'Interceptor',
    detail: 'Runs the steps inside it as an RxJS stream, to get at the return value.',
    creates: '19 promises, 15 RxJS subscriptions',
    share: 70,
    without: 'No interceptor',
  },
  {
    name: 'A pipe on each parameter',
    detail: 'Each value passes through five async functions.',
    creates: '26 promises',
    share: 20,
    without: 'No pipe',
  },
  {
    name: 'Prototype keys removed',
    detail: 'From each value, before its schema sees it.',
    share: 10,
    without: 'Left to the schema',
  },
  { name: 'Zod parses the parameters' },
  { name: 'Your handler runs' },
  { name: 'Zod parses the response' },
];

// Grid rows: the two names are row 1 and the steps follow. The interceptor's frame runs from its
// own row to an empty one after the last step, which is the room under the steps inside it.
const row = (index) => index + 2;
const interceptor = steps.findIndex((step) => step.name === 'Interceptor');
const frame = `${row(interceptor)} / ${row(steps.length) + 1}`;
const totals = row(steps.length) + 1;
</script>

<template>
  <figure class="pipeline">
    <div
      class="lanes"
      role="table"
      aria-label="What a validated request passes through, in a NestJS controller and in an endpoint"
    >
      <div class="row" role="row">
        <p class="lane left nest" role="columnheader">NestJS controller</p>
        <p class="lane right endpoints" role="columnheader">
          <span class="endpoint-term">endpoint</span>
        </p>
      </div>
      <span class="frame left" aria-hidden="true" :style="{ gridRow: frame }" />
      <div v-for="(step, index) in steps" :key="step.name" class="row" role="row">
        <div
          class="step left"
          :class="{
            extra: step.share,
            wraps: index === interceptor,
            inside: index > interceptor,
          }"
          :style="{ gridRow: row(index) }"
          role="cell"
        >
          <p class="name">
            <span>{{ step.name }}</span>
            <span v-if="step.share" class="share">{{ step.share }}%</span>
          </p>
          <p v-if="step.detail" class="detail">{{ step.detail }}</p>
          <p v-if="step.creates" class="creates">{{ step.creates }}</p>
        </div>
        <div
          class="step right"
          :class="{ absent: step.without }"
          :style="{ gridRow: row(index) }"
          role="cell"
        >
          <p class="name">{{ step.without ?? step.name }}</p>
        </div>
      </div>
      <div class="row" role="row">
        <div class="total left" :style="{ gridRow: totals }" role="cell">
          <p class="time">{{ microseconds(request.nest) }} <small>microseconds a request</small></p>
          <p class="creates">59 promises, 15 RxJS subscriptions</p>
        </div>
        <div class="total right" :style="{ gridRow: totals }" role="cell">
          <p class="time">
            {{ microseconds(request.endpoints) }} <small>microseconds a request</small>
          </p>
          <p class="creates">14 promises, as many as a route with no schemas</p>
        </div>
      </div>
    </div>
    <figcaption>
      A <code>GET</code> with path and search parameters. A percentage is that step's share of what
      the three cost together, to the nearest 5%.
    </figcaption>
  </figure>
</template>

<style scoped>
.pipeline {
  margin: 24px 0;
}

.lanes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

/* A row is there for a screen reader: its cells are placed on the grid themselves. */
.row {
  display: contents;
}

.left {
  grid-column: 1;
}

.right {
  grid-column: 2;
}

p {
  margin: 0;
}

.lane {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px 4px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

/* The chart's two colors, so a lane reads as the bar of the same name. */
.lane::before {
  content: '';
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.lane.nest::before {
  background: var(--benchmark-nest);
}

.lane.endpoints::before {
  background: var(--benchmark-endpoints);
}

.step {
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

/* What only the controller runs. */
.step.extra {
  border-color: transparent;
  background: var(--vp-c-default-soft);
}

/* The interceptor is its frame's first lines, and the steps it wraps sit inside the frame. */
.frame {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-default-soft);
}

.step.wraps {
  background: none;
}

.step.inside {
  margin-inline: 8px;
}

/* The slot of a step an endpoint doesn't run. */
.step.absent {
  display: flex;
  align-items: center;
  border-color: var(--vp-c-border);
  border-style: dashed;
  background: none;
}

.name {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.absent .name {
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.share {
  flex: none;
  padding: 0 8px;
  border-radius: 10px;
  background: var(--vp-c-bg);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.detail,
.creates {
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}

.detail {
  margin-top: 2px;
}

.step .creates {
  margin-top: 6px;
  color: var(--vp-c-text-1);
}

.total {
  padding: 4px 12px 0;
}

.time {
  font-size: 24px;
  line-height: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}

.time small {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--vp-c-text-2);
}

figcaption {
  margin-top: 16px;
  font-size: 13px;
  line-height: 18px;
  color: var(--vp-c-text-2);
}

@media (max-width: 480px) {
  .lanes {
    column-gap: 8px;
  }

  .step {
    padding: 8px;
  }

  .step.inside {
    margin-inline: 5px;
  }

  .name {
    font-size: 13px;
    line-height: 18px;
  }

  .detail,
  .creates {
    font-size: 12px;
    line-height: 16px;
  }

  .total {
    padding-inline: 8px;
  }

  .time {
    font-size: 20px;
    line-height: 28px;
  }

  /* Under its number: beside it, the unit would break in the middle. */
  .time small {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    line-height: 16px;
  }
}
</style>
