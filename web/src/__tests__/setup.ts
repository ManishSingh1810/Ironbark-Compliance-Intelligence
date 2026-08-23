// Vitest setup — canvas stub for Chart.js under jsdom
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    fillRect: () => undefined,
    clearRect: () => undefined,
    measureText: () => ({ width: 0 }),
  }),
});
