<template>
  <div class="animate-pulse space-y-6" aria-busy="true" aria-label="Loading dashboard">
    <div class="h-28 rounded-xl bg-slate-200" />
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="n in 6" :key="n" class="h-28 rounded-xl bg-slate-200" />
    </div>
    <div class="h-96 rounded-xl bg-slate-200" />
    <div class="h-64 rounded-xl bg-slate-200" />
  </div>
</template>
