<script setup>
import { count, differenceLabel, rangeLabel, scenarios } from './results';

// The chart's numbers as a table, with the range each median comes from.
const cell = (measured) => `${count(measured.median)} (${rangeLabel(measured)})`;
</script>

<template>
  <table>
    <thead>
      <tr>
        <th>Request</th>
        <th>Validated</th>
        <th>nestjs-endpoints</th>
        <th>NestJS</th>
        <th>Difference</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="scenario in scenarios" :key="scenario.id">
        <td>{{ scenario.label }}</td>
        <td>{{ scenario.validated }}</td>
        <td>{{ cell(scenario.endpoints) }}</td>
        <td>{{ cell(scenario.nest) }}</td>
        <td>{{ differenceLabel(scenario) }}</td>
      </tr>
    </tbody>
  </table>
</template>
