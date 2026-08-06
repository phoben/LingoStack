import "@testing-library/jest-dom/vitest";

// jsdom 未实现 matchMedia，主题解析逻辑依赖它，提供最小桩（默认浅色）。
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
