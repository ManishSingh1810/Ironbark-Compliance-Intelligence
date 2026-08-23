<script setup lang="ts">
defineProps<{
  message: string;
}>();

defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div
    class="rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center"
    role="alert"
  >
    <h2 class="text-lg font-semibold text-red-800">Unable to load dashboard</h2>
    <p class="mt-2 text-sm text-red-700">{{ message }}</p>
    <button
      type="button"
      class="mt-4 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
      @click="$emit('retry')"
    >
      Retry
    </button>
  </div>
</template>
