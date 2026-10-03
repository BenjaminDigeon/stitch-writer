<script lang="ts">
  import { searchThreads, threadById, type Thread } from '../lib/threads/dmc.ts';

  let { value, label, onchange }: { value: string; label: string; onchange: (id: string) => void } = $props();

  const id = `dmc-${Math.random().toString(36).slice(2, 8)}`;
  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const current = $derived(threadById(value));
  const results = $derived(open ? searchThreads(query, 60) : []);

  function pick(t: Thread) {
    onchange(t.id);
    open = false;
    query = '';
  }

  function onkeydown(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      open = true;
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = results[active];
      if (t) pick(t);
    } else if (e.key === 'Escape') {
      open = false;
      query = '';
    }
  }

  $effect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div class="combo">
  <label for={id} class="label">{label}</label>
  <div class="control">
    <span class="swatch" style:background={current?.hex ?? '#ccc'}></span>
    <input
      {id}
      bind:this={input}
      type="text"
      role="combobox"
      aria-expanded={open}
      aria-controls="{id}-list"
      aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
      autocomplete="off"
      placeholder={current ? `${current.id} · ${current.name}` : 'DMC number or name'}
      value={query}
      oninput={(e) => {
        query = e.currentTarget.value;
        open = true;
        active = 0;
      }}
      onfocus={() => (open = true)}
      onblur={() => setTimeout(() => (open = false), 120)}
      {onkeydown}
    />
  </div>
  {#if open}
    <ul id="{id}-list" class="list" role="listbox" aria-label={label}>
      {#each results as t, i (t.id)}
        <li id="{id}-opt-{i}" role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(t)}>
            <span class="swatch" style:background={t.hex}></span>
            <span class="num">{t.id}</span>
            <span class="name">{t.name}</span>
            {#if t.id === value}<span aria-hidden="true">✓</span>{/if}
          </button>
        </li>
      {:else}
        <li class="none">No thread found.</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .combo {
    position: relative;
    display: grid;
    gap: 4px;
  }

  .control {
    position: relative;
  }

  .control .swatch {
    position: absolute;
    left: 8px;
    top: 8px;
  }

  .control input {
    width: 100%;
    padding-left: 32px;
  }

  .control input::placeholder {
    color: var(--text);
  }

  .swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgb(0 0 0 / 20%);
    flex: none;
  }

  .list {
    position: absolute;
    z-index: 10;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 260px;
    overflow: auto;
    margin: 4px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
  }

  .list button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    border: 0;
    border-radius: 4px;
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .list li[aria-selected='true'] button {
    background: var(--accent-soft);
  }

  .num {
    font-family: var(--mono);
    font-size: 12px;
    width: 44px;
  }

  .name {
    flex: 1;
  }

  .none {
    padding: 6px;
    color: var(--muted);
  }
</style>
