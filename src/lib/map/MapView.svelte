<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MapLibreMap, NavigationControl, ScaleControl, type MapMouseEvent } from "./maplibre";
  import type { Basemap } from "./basemaps";

  interface Props {
    basemap: Basemap;
    globe: boolean;
    /** Called as the cursor moves over the map, with null when it leaves. */
    onCursor?: (lngLat: { lng: number; lat: number } | null) => void;
    onZoom?: (zoom: number) => void;
  }

  let { basemap, globe, onCursor, onZoom }: Props = $props();

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined;
  let currentStyle: string | undefined;

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

    map.on("style.load", () => map?.setProjection({ type: globe ? "globe" : "mercator" }));
    map.on("mousemove", (e: MapMouseEvent) => onCursor?.(e.lngLat));
    map.on("mouseout", () => onCursor?.(null));
    map.on("zoom", () => onZoom?.(map!.getZoom()));
    onZoom?.(map.getZoom());
  });

  onDestroy(() => map?.remove());

  // React to prop changes after the map exists. The map was created with the initial
  // style, so only swap styles when the user actually picks a different basemap.
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
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
</style>
