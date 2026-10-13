<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    MapLibreMap,
    NavigationControl,
    ScaleControl,
    type LayerSpecification,
    type MapMouseEvent,
  } from "./maplibre";
  import type { Basemap } from "./basemaps";
  import { planUpdate } from "./layerDiff";
  import { sourceId, styleLayersFor } from "../style/layerStyle";
  import { SHAPE_PIXEL_RATIO, shapeFromImageId, shapeImage } from "../style/shapes";
  import type { MapLayer } from "./types";
  import type { FeatureCollection } from "geojson";

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
  /** The style layers currently on the map for each data layer (by MapLayer id). */
  let applied = new Map<string, LayerSpecification[]>();
  /** The layer order last applied, as text, so we only reorder when it changes. */
  let appliedOrder = "";

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
    // In development, expose the map for poking at from the browser console.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__smartmapMap = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    // A new basemap style wipes everything we added, so redo projection and layers.
    map.on("style.load", () => {
      map?.setProjection({ type: globe ? "globe" : "mercator" });
      applied = new Map();
      appliedOrder = "";
      styleVersion++;
    });
    // Point-shape icons are made on demand, the first time a layer asks for one
    // (and again after a basemap switch, which drops all images).
    map.on("styleimagemissing", (e) => {
      const shape = shapeFromImageId(e.id);
      if (shape && !map?.hasImage(e.id)) {
        map?.addImage(e.id, shapeImage(shape), { sdf: true, pixelRatio: SHAPE_PIXEL_RATIO });
      }
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

  /** Adds, updates, reorders and removes our sources and style layers so the map shows exactly `wanted`. */
  function syncLayers(m: MapLibreMap, wanted: MapLayer[]) {
    // Remove layers that were closed.
    const wantedIds = new Set(wanted.map((layer) => layer.id));
    for (const [id, specs] of applied) {
      if (wantedIds.has(id)) continue;
      for (const spec of specs) m.removeLayer(spec.id);
      m.removeSource(sourceId(id));
      applied.delete(id);
    }

    for (const layer of wanted) {
      const next = styleLayersFor(layer);
      const previous = applied.get(layer.id);
      if (!previous) {
        // New layer. Its data never changes once loaded, so the source is added once.
        // MapLibre skips features without geometry, but its types don't allow them, hence the cast.
        m.addSource(sourceId(layer.id), { type: "geojson", data: layer.data.geojson as FeatureCollection });
        for (const spec of next) m.addLayer(spec);
      } else {
        const plan = planUpdate(previous, next);
        if (plan.rebuild) {
          for (const spec of previous) m.removeLayer(spec.id);
          for (const spec of next) m.addLayer(spec);
        } else {
          // Small change (colour, width, opacity...): set just those properties.
          // The property names come from our own style layers, so they're valid;
          // `as never` tells TypeScript to trust that.
          for (const change of plan.changes) {
            if (change.kind === "paint") m.setPaintProperty(change.layerId, change.property as never, change.value as never);
            else if (change.kind === "layout") m.setLayoutProperty(change.layerId, change.property as never, change.value as never);
            else m.setFilter(change.layerId, change.value as never);
          }
        }
      }
      applied.set(layer.id, next);
    }

    // Stack the style layers in list order. `moveLayer(id)` with no second
    // argument moves a layer to the top, so going bottom to top leaves them in order.
    const order = wanted.map((layer) => applied.get(layer.id)!.map((spec) => spec.id).join(",")).join("|");
    if (order !== appliedOrder) {
      for (const layer of wanted) for (const spec of applied.get(layer.id)!) m.moveLayer(spec.id);
      appliedOrder = order;
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
