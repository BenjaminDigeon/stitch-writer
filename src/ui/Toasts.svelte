<script lang="ts" module>
  export interface ToastAction {
    label: string;
    run: () => void;
  }

  interface Item {
    id: number;
    text: string;
    kind: 'info' | 'warn';
    action?: ToastAction;
  }

  let items = $state<Item[]>([]);
  let next = 1;

  /** Shows a short message for 6 seconds (12 seconds when it has an action). */
  export function toast(text: string, kind: 'info' | 'warn' = 'info', action?: ToastAction): void {
    const id = next++;
    items.push({ id, text, kind, action });
    setTimeout(() => dismiss(id), action ? 12000 : 6000);
  }

  function dismiss(id: number) {
    const i = items.findIndex((t) => t.id === id);
    if (i >= 0) items.splice(i, 1);
  }
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each items as t (t.id)}
    <div class="toast {t.kind}">
      <span>{t.text}</span>
      {#if t.action}
        <button
          class="btn"
          onclick={() => {
            t.action!.run();
            dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="btn ghost icon" aria-label="Close" onclick={() => dismiss(t.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    display: grid;
    gap: 8px;
    z-index: 100;
    width: max-content;
    max-width: calc(100vw - 24px);
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-radius: var(--radius);
    background: var(--text);
    color: var(--panel);
    box-shadow: var(--shadow);
  }

  .toast.warn {
    background: var(--warn-soft);
    color: var(--text);
    border: 1px solid var(--warn);
  }

  .toast .btn {
    color: var(--text);
  }

  .toast .btn.ghost {
    color: inherit;
  }
</style>
