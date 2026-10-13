<script lang="ts">
  /** "Getting offline maps": how to make a PMTiles file and use it. The longer version is docs/OFFLINE_MAPS.md. */
  let { onClose }: { onClose: () => void } = $props();

  // An example that cuts out Pakistan; the date is any recent daily build.
  const EXAMPLE =
    "pmtiles extract https://build.protomaps.com/20261001.pmtiles pakistan.pmtiles --bbox=60.8,23.6,77.9,37.1 --maxzoom=12";
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<div class="help" role="dialog" aria-label="Getting offline maps">
  <header>
    <h2>Getting offline maps</h2>
    <button class="close" aria-label="Close" onclick={onClose}>×</button>
  </header>
  <p>
    SmartMap can show a basemap from a file on your computer, so it works with no internet connection. It reads
    <strong>PMTiles</strong> and <strong>MBTiles</strong> files.
  </p>
  <ol>
    <li>
      Get the free <code>pmtiles</code> program from <code>github.com/protomaps/go-pmtiles/releases</code>.
    </li>
    <li>
      Cut your area out of the world map that Protomaps builds every day (the dates are listed at
      <code>maps.protomaps.com/builds</code>). For example, Pakistan:
      <pre>{EXAMPLE}</pre>
      <code>--bbox</code> is west, south, east, north in degrees. A country up to zoom 12 is a few hundred MB; each extra zoom
      level makes the file about four times bigger.
    </li>
    <li>Choose <em>Basemap → Open offline map…</em> and pick the file. Save the project and it will open with it next time.</li>
  </ol>
  <p class="muted">
    Protomaps files can be shown in five colour schemes. Other files work too: image tiles are shown as they are, and
    other vector tiles, including older Protomaps files (version 3), get a plain grey style. Labels use your computer's
    fonts.
  </p>
</div>

<style>
  .help {
    position: fixed;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 80px);
    overflow: auto;
    padding: 12px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
    white-space: normal;
  }
  header {
    display: flex;
    align-items: center;
  }
  h2 {
    font-size: 15px;
    margin: 0;
    flex: 1;
  }
  .close {
    font: inherit;
    font-size: 18px;
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  ol {
    padding-left: 20px;
  }
  li {
    margin-bottom: 8px;
  }
  pre {
    margin: 6px 0;
    padding: 6px 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    user-select: text;
    font-size: 12px;
  }
  code {
    user-select: text;
  }
  .muted {
    color: var(--muted);
    font-size: 12px;
  }
</style>
