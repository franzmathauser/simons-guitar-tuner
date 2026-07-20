/**
 * Vitest config for Svelte 5 component tests.
 *
 * `vite.config.ts` (used by `vite build`) is intentionally left untouched. Vitest
 * prefers this file, so component tests get the `browser` resolve condition +
 * noExternal wiring that @testing-library/svelte needs to render Svelte 5
 * components (otherwise `svelte`'s server build is loaded and `mount()` throws).
 * All other settings (jsdom env, globals, setupFiles, plugins) are inherited
 * from vite.config.ts via mergeConfig.
 */
import { mergeConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, {
  plugins: [svelteTesting()],
  resolve: {
    // Ensure Svelte's browser build (client `mount`) is used under Vitest.
    conditions: ['browser'],
  },
});
