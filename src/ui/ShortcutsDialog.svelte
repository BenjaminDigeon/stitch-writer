<script lang="ts">
  let dialog: HTMLDialogElement | undefined = $state();
  export function open() {
    dialog?.showModal();
  }
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';
  const alt = isMac ? '⌥' : 'Alt';
  const rows: [string, string][] = [
    [`${mod} K`, 'Insert a motif or a special character'],
    [':heart', 'Motif names: type ":" and the start of the name'],
    [`${mod} P`, 'Export the chart (PDF, SVG, PNG)'],
    [`${mod} ⇧ L / E / R`, 'Align left, center, right'],
    [`${mod} Z`, 'Undo the last change of the text or of the colors'],
    [`${mod} ${alt} 1 … 9`, 'Give color 1 to 9 to the selected text'],
    [`${mod} ${alt} 0`, 'Give the selected text back to the automatic colors'],
    [`${mod} + wheel, pinch`, 'Zoom the chart at the pointer'],
    ['Wheel, drag', 'Move the chart'],
    ['+  −  0  F', 'Zoom in, zoom out, 100 %, fit (when the chart has the focus)'],
    ['Click a letter', 'Select its text'],
    ['Shift + click a letter', 'Add the letter to the selection'],
    ['?', 'Show this list'],
  ];
</script>

<dialog bind:this={dialog} aria-labelledby="sc-title" onclick={(e) => e.target === dialog && dialog?.close()}>
  <div class="body">
    <h2 id="sc-title">Keyboard shortcuts</h2>
    <table>
      <tbody>
        {#each rows as [k, d] (k)}
          <tr><td><kbd>{k}</kbd></td><td>{d}</td></tr>
        {/each}
      </tbody>
    </table>
    <form method="dialog"><button class="btn">Close</button></form>
  </div>
</dialog>

<style>
  .body {
    padding: 18px 20px;
    display: grid;
    gap: 12px;
    max-width: 520px;
  }

  h2 {
    margin: 0;
    font-size: 16px;
  }

  td {
    padding: 4px 12px 4px 0;
    vertical-align: top;
  }

  form {
    justify-self: end;
  }
</style>
