<!--
  Flow lanes side by side, as startup beside shutdown: one under the other on a narrow screen.
  A lane alone is as wide as one of a pair.
-->
<template>
  <div class="pair"><slot /></div>
</template>

<style scoped>
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
  margin: 20px 0;
}

@media (max-width: 560px) {
  .pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
