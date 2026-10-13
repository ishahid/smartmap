<script lang="ts">
  /** "Getting offline maps": how to make a PMTiles file and use it. The longer version is docs/OFFLINE_MAPS.md. */
  import Dialog from "../shell/Dialog.svelte";

  let { onClose }: { onClose: () => void } = $props();

  // An example that cuts out Pakistan; the date is any recent daily build.
  const EXAMPLE =
    "pmtiles extract https://build.protomaps.com/20261001.pmtiles pakistan.pmtiles --bbox=60.8,23.6,77.9,37.1 --maxzoom=12";
</script>

<Dialog title="Getting offline maps" width={560} {onClose}>
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
    <li>
      Choose <em>Basemap → Open offline map…</em> (or <em>File → Open Offline Map…</em>) and pick the file, or drop it on
      the window. Save the project and it will open with it next time.
    </li>
  </ol>
  <p class="muted">
    Protomaps files can be shown in five colour schemes. Other files work too: image tiles are shown as they are, and
    other vector tiles, including older Protomaps files (version 3), get a plain grey style. Labels use your computer's
    fonts.
  </p>
</Dialog>

<style>
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
