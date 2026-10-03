<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { AppState } from '../lib/state/app.svelte.ts';
  import { readStartupDoc, shareUrl, startPersistence } from '../lib/state/persist.svelte.ts';
  import { DEFAULTS_V1, type Doc } from '../lib/state/doc.ts';
  import type { Span } from '../lib/layout/types.ts';
  import PreviewBanner from './PreviewBanner.svelte';
  import TextInput from './TextInput.svelte';
  import FontPicker from './FontPicker.svelte';
  import SettingsPanel from './SettingsPanel.svelte';
  import Preview from './Preview.svelte';
  import StatusBar from './StatusBar.svelte';
  import ExportDialog from './ExportDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import Toasts, { toast } from './Toasts.svelte';
  import GitHubLink from './GitHubLink.svelte';
  import { FONT_CHANNEL } from '../lib/font/custom-store.ts';

  const app = new AppState();
  setContext('app', app);
  const newDocFontId = DEFAULTS_V1.fontId;

  let ready = $state(false);
  let input: TextInput | undefined = $state();
  let exportDialog: ExportDialog | undefined = $state();
  let shortcuts: ShortcutsDialog | undefined = $state();

  onMount(() => {
    let stop: (() => void) | undefined;
    void (async () => {
      const start = await readStartupDoc();
      app.replaceDoc(start.doc);
      await app.refreshCustomFonts();
      await app.loadFont(start.doc.fontId);
      if (app.fontStatus === 'missing') {
        toast(`The font of this chart is not in this browser. The default font is used.`, 'warn');
        app.selectFont(newDocFontId);
      }
      ready = true;
      stop = startPersistence(app);
      if (start.linkError === 'newer-version')
        toast('This link comes from a newer version of Stitch Writer.', 'warn');
      else if (start.linkError) toast('The link is damaged. Your last draft is open.', 'warn');
      if (start.replacedDraft) {
        const draft: Doc = start.replacedDraft;
        toast('You opened a shared chart.', 'info', {
          label: 'Restore my previous draft',
          run: () => {
            app.replaceDoc(draft);
            void app.loadFont(draft.fontId);
          },
        });
      }
    })();
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(FONT_CHANNEL);
    if (channel)
      channel.onmessage = (e: MessageEvent<{ id?: string }>) => void app.refreshCustomFonts(e.data?.id);
    return () => {
      stop?.();
      channel?.close();
    };
  });

  $effect(() => {
    const first = app.doc.text.split('\n')[0]?.trim();
    document.title = first ? `${first.slice(0, 40)} · Stitch Writer` : 'Stitch Writer';
  });

  const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

  function onKeydown(e: KeyboardEvent) {
    if (mod(e) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      exportDialog?.open();
    } else if (mod(e) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      input?.openPalette();
    } else if (mod(e) && e.shiftKey && ['l', 'e', 'r'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      app.doc.layout.align = ({ l: 'left', e: 'centre', r: 'right' } as const)[
        e.key.toLowerCase() as 'l' | 'e' | 'r'
      ];
    } else if (
      e.key === '?' &&
      !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
    ) {
      e.preventDefault();
      shortcuts?.open();
    }
  }

  async function share() {
    const url = await shareUrl($state.snapshot(app.doc) as Doc);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Stitch Writer chart', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast(
        url.length > 8000 ? 'Link copied. It is very long: some apps can cut it.' : 'Link copied.',
        'info',
      );
    } catch {
      toast('Could not copy the link. Copy it from the address bar.', 'warn');
    }
  }

  function selectRange(span: Span) {
    input?.select(span);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <PreviewBanner />
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"
        ><g stroke="var(--accent)" stroke-width="3.4" stroke-linecap="round"
          ><path d="M7 7l7 7M14 7l-7 7M18 7l7 7M25 7l-7 7M7 18l7 7M14 18l-7 7" /></g
        ><g stroke="currentColor" stroke-width="3.4" stroke-linecap="round"
          ><path d="M18 18l7 7M25 18l-7 7" /></g
        ></svg
      >
      <h1>Stitch Writer</h1>
    </div>
    <FontPicker />
    <div class="spacer"></div>
    <a class="btn ghost" href="./editor.html" title="Make or change a font">Font editor</a>
    <button
      class="btn ghost help"
      onclick={() => shortcuts?.open()}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)">?</button
    >
    <GitHubLink />
    <button class="btn" onclick={share} disabled={!app.doc.text.trim()}
      >Share<span class="wide">link</span></button
    >
    <button class="btn primary" onclick={() => exportDialog?.open()} disabled={!app.chart.width}
      >Export</button
    >
  </header>

  <main class="workspace">
    <aside class="side">
      <TextInput bind:this={input} />
      <SettingsPanel />
    </aside>
    <section class="stage" aria-label="Chart preview">
      <Preview onselectrange={selectRange} loading={!ready || app.fontStatus === 'loading'} />
    </section>
  </main>

  <StatusBar />
</div>

<ExportDialog bind:this={exportDialog} />
<ShortcutsDialog bind:this={shortcuts} />
<Toasts />

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
  }

  h1 {
    font-size: 16px;
    margin: 0;
    letter-spacing: 0.01em;
  }

  .spacer {
    flex: 1;
  }

  a.btn {
    text-decoration: none;
    color: inherit;
  }

  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(300px, 380px) 1fr;
    min-height: 0;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    overflow: auto;
    border-right: 1px solid var(--line);
    background: var(--panel);
  }

  .stage {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .side {
    min-width: 0;
  }

  @media (max-width: 760px) {
    .topbar {
      gap: 6px;
      padding: 6px 8px;
    }

    h1,
    .topbar .help,
    .topbar a.btn {
      display: none;
    }

    .brand {
      margin-right: 0;
    }

    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(260px, 45svh) auto;
      overflow: auto;
    }

    .stage {
      order: -1;
      border-bottom: 1px solid var(--line);
    }

    .side {
      border-right: 0;
      overflow: visible;
    }
  }

  @media (max-width: 480px) {
    .wide {
      display: none;
    }
  }
</style>
