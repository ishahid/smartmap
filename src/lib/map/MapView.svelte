<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MapLibreMap, NavigationControl, ScaleControl, type MapMouseEvent } from "./maplibre";
  import type { Basemap } from "./basemaps";
  import { sourceId, styleLayersFor } from "./layerStyle";
  import type { MapLayer } from "./types";

  interface Props {
    basemap: Basemap;
    globe: boolean;
    /** Data layers to draw, bottom first. */
    layers: MapLayer[];
    /** Called as the cursor moves over the map, with null when it leaves. */
    onCursor?: (lngLat: { lng: number; lat: number } | null) => void;
    onZoom?: (zoom: number) => void;
  }

  let { basemap, globe, layers, onCursor, onZoom }: Props = $props();

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined;
  let currentStyle: string | undefined;
  /** Bumped every time a style finishes loading, so the layer sync below re-runs. */
  let styleVersion = $state(0);

  onMount(() => {
    currentStyle = basemap.style;
    map = new MapLibreMap({
      container,
      style: basemap.style,
      // Start over Rawalpindi, where the 2004 SmartMap was written.
      center: [73.05, 33.6],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    // A new basemap style wipes everything we added, so redo projection and layers.
    map.on("style.load", () => {
      map?.setProjection({ type: globe ? "globe" : "mercator" });
      styleVersion++;
    });
    map.on("mousemove", (e: MapMouseEvent) => onCursor?.(e.lngLat));
    map.on("mouseout", () => onCursor?.(null));
    map.on("zoom", () => onZoom?.(map!.getZoom()));
    onZoom?.(map.getZoom());
  });

  onDestroy(() => map?.remove());

  /** Zooms the map to show a box given as [minX, minY, maxX, maxY]. */
  export function fitBounds(bbox: [number, number, number, number]) {
    // Clamp to the range Web Mercator can show, so whole-world layers still fit.
    const [minX, minY, maxX, maxY] = bbox;
    map?.fitBounds(
      [
        [Math.max(minX, -180), Math.max(minY, -85)],
        [Math.min(maxX, 180), Math.min(maxY, 85)],
      ],
      { padding: 40, duration: 600, maxZoom: 16 },
    );
  }

  // Swap the basemap when the user picks a different one.
  $effect(() => {
    const style = basemap.style;
    if (map && style !== currentStyle) {
      currentStyle = style;
      map.setStyle(style);
    }
  });

  $effect(() => {
    const type = globe ? "globe" : "mercator";
    if (map?.isStyleLoaded()) map.setProjection({ type });
  });

  // Keep MapLibre's sources/layers in step with the `layers` prop.
  // Re-runs when `layers` changes or a new basemap style has loaded.
  $effect(() => {
    void styleVersion; // reading it makes this effect depend on it
    const wanted = layers;
    if (!map || styleVersion === 0) return;
    syncLayers(map, wanted);
  });

  /** Adds, updates and removes our sources so the map shows exactly `wanted`. */
  function syncLayers(m: MapLibreMap, wanted: MapLayer[]) {
    const wantedSources = new Set(wanted.map((l) => sourceId(l.id)));

    // Remove layers that were closed. Our ids all start with "sm-".
    for (const styleLayer of m.getStyle().layers ?? []) {
      if ("source" in styleLayer && styleLayer.id.startsWith("sm-") && !wantedSources.has(styleLayer.source as string)) {
        m.removeLayer(styleLayer.id);
      }
    }
    for (const id of Object.keys(m.getStyle().sources ?? {})) {
      if (id.startsWith("sm-") && !wantedSources.has(id)) m.removeSource(id);
    }

    // Add layers the map doesn't have yet. Layers already on the map are left alone:
    // a file's data doesn't change once loaded. Order: first in list = bottom.
    for (const layer of wanted) {
      const id = sourceId(layer.id);
      if (m.getSource(id)) continue;
      m.addSource(id, { type: "geojson", data: layer.data.geojson });
      for (const styleLayer of styleLayersFor(layer.id, layer.color)) m.addLayer(styleLayer);
    }
  }
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
</style>
