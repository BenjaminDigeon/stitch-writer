<script lang="ts">
  import { PREVIEW } from '../lib/preview.ts';
</script>

{#if PREVIEW}
  <div class="preview-banner" role="note">
    <strong>Preview</strong> of
    <a href={PREVIEW.url} target="_blank" rel="noopener noreferrer">pull request #{PREVIEW.number}</a>. Your
    work and your fonts here stay apart from the <a href="../../">main site</a>.
  </div>
{/if}

<style>
  .preview-banner {
    flex: none;
    padding: 4px 12px;
    background: #fff3c4;
    color: #4a3b00;
    border-bottom: 1px solid #e6cf73;
    font-size: 12px;
    text-align: center;
  }

  @media (prefers-color-scheme: dark) {
    .preview-banner {
      background: #3d3410;
      color: #f5e6a8;
      border-color: #6b5a1c;
    }
  }

  a {
    color: inherit;
    text-decoration: underline;
  }
</style>
