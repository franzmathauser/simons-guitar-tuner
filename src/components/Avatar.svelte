<script lang="ts">
  /**
   * Avatar mascot (architecture §5). Shows one of three poses by tuning state,
   * matching the mockup avatar (fade/scale-in of the active pose).
   */
  import type { TuneState } from '../lib/pitch/state';
  import avatarLow from '../lib/assets/avatar-low.png';
  import avatarOk from '../lib/assets/avatar-ok.png';
  import avatarHigh from '../lib/assets/avatar-high.png';

  let { state }: { state: TuneState } = $props();
</script>

<div class="avatar" aria-hidden="true">
  <img class="avatar__img avatar__img--low" class:is-on={state === 'low'} src={avatarLow} alt="" />
  <img class="avatar__img avatar__img--ok" class:is-on={state === 'ok'} src={avatarOk} alt="" />
  <img class="avatar__img avatar__img--high" class:is-on={state === 'high'} src={avatarHigh} alt="" />
</div>
