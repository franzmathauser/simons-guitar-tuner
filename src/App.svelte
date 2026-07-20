<script lang="ts">
  /**
   * Root device shell (architecture §5): topbar (brand + tuning select + theme
   * toggle), the Tuner/Metronome panels, and the bottom tab nav. Owns the active
   * tuning and active tab as `$state`; passes the active tuning down to Tuner.
   */
  import './app.css';
  import { TUNINGS, TUNING_ORDER } from './lib/tuning/tunings';
  import type { TuningId } from './lib/tuning/types';
  import Tuner from './components/Tuner.svelte';
  import Metronome from './components/Metronome.svelte';

  let tuningId = $state<TuningId>('standard');
  let activeTab = $state<'tuner' | 'metro'>('tuner');

  const activeTuning = $derived(TUNINGS[tuningId]);

  function onTuningChange(e: Event): void {
    tuningId = (e.currentTarget as HTMLSelectElement).value as TuningId;
  }

  /** Flip data-theme; the explicit attribute wins over the OS preference (AC-15). */
  function toggleTheme(): void {
    const root = document.documentElement;
    const cur = root.getAttribute('data-theme');
    const prefersDark =
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : prefersDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
  }
</script>

<main class="device" aria-label="Gitarren-Stimmgerät">
  <div class="topbar">
    <div class="brand">
      <span class="brand__mark" aria-hidden="true"></span>
      <span class="brand__name">Ton-Gemetzel <span>· Gitarre</span></span>
    </div>
    <div class="topbar__actions">
      <div class="tuning">
        <select aria-label="Stimmung wählen" value={tuningId} onchange={onTuningChange}>
          {#each TUNING_ORDER as id (id)}
            <option value={id}>{TUNINGS[id].label}</option>
          {/each}
        </select>
      </div>
      <button class="theme-btn" type="button" aria-label="Farbschema wechseln" onclick={toggleTheme}
        >◐</button
      >
    </div>
  </div>

  <Tuner tuning={activeTuning} active={activeTab === 'tuner'} />
  <Metronome active={activeTab === 'metro'} />

  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <nav class="tabs" role="tablist">
    <button
      class="tab"
      class:is-active={activeTab === 'tuner'}
      type="button"
      role="tab"
      aria-selected={activeTab === 'tuner'}
      onclick={() => (activeTab = 'tuner')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M4 12h16M12 6v12" stroke-linecap="round" /><circle cx="12" cy="12" r="3" /></svg
      >
      Stimmen
    </button>
    <button
      class="tab"
      class:is-active={activeTab === 'metro'}
      type="button"
      role="tab"
      aria-selected={activeTab === 'metro'}
      onclick={() => (activeTab = 'metro')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M8 3h8l3 18H5z" stroke-linejoin="round" /><path
          d="M12 20V9"
          stroke-linecap="round"
        /></svg
      >
      Metronom
    </button>
  </nav>
</main>
