<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    MapLibreMap,
    NavigationControl,
    ScaleControl,
    type GeoJSONSource,
    type LayerSpecification,
    type MapMouseEvent,
  } from "./maplibre";
  import type { Basemap } from "./basemaps";
  // Registers the smartmap-tiles:// protocol that offline basemaps use.
  import "./tileProtocol";
  import { planUpdate } from "./layerDiff";
  import { layerIdFromSource, selectionLayersFor, sourceId, styleLayersFor } from "../style/layerStyle";
  import { filterExpression } from "../filter";
  import { eachPosition, numericFieldsOf } from "../features";
  import { SHAPE_PIXEL_RATIO, shapeFromImageId, shapeImage } from "../style/shapes";
  import type { FeatureHit, MapLayer } from "./types";
  import type { Selection } from "../selection.svelte";
  import type { MapViewState } from "../api";
  import type { FeatureCollection, Position } from "geojson";
  import type { LayerData } from "../api";
  import type { UnitSystem } from "../measure/units";

  interface Props {
    basemap: Basemap;
    globe: boolean;
    /** Data layers to draw, bottom first. */
    layers: MapLayer[];
    /** Called as the cursor moves over the map, with null when it leaves. */
    onCursor?: (lngLat: { lng: number; lat: number } | null) => void;
    onZoom?: (zoom: number) => void;
    /** Selected features to highlight. */
    selection: Selection;
    /** A layer whose selection isn't highlighted (the annotation layer being edited: terra-draw shows it). */
    noHighlightLayerId?: string | null;
    /**
     * The mouse cursor: a pointing hand over features ("features"), a
     * crosshair (measuring), or "off" to leave it to terra-draw while editing.
     */
    cursorMode?: "features" | "crosshair" | "off";
    /**
     * Called when the map is clicked, with the features under the pointer,
     * top first (empty when the click missed everything).
     */
    onFeatureClick?: (hits: FeatureHit[]) => void;
    /** Called once with the MapLibre map, when it's created (the annotation editor needs it). */
    onMapReady?: (map: MapLibreMap) => void;
    /** Called after a basemap switch has finished loading (and wiped anything added to the map). */
    onStyleLoad?: () => void;
    /** Units for the scale bar (the Preferences setting). */
    units?: UnitSystem;
  }

  let {
    basemap,
    globe,
    layers,
    onCursor,
    onZoom,
    selection,
    noHighlightLayerId = null,
    cursorMode = "features",
    onFeatureClick,
    onMapReady,
    onStyleLoad,
    units = "metric",
  }: Props = $props();

  let container: HTMLDivElement;
  let map: MapLibreMap | undefined;
  let scale: ScaleControl | undefined;
  /** The id of the basemap whose style is on the map. */
  let currentBasemapId: string | undefined;
  /** Bumped every time a style finishes loading, so the layer sync below re-runs. */
  let styleVersion = $state(0);
  /** The style layers currently on the map for each data layer (by MapLayer id). */
  let applied = new Map<string, LayerSpecification[]>();
  /** The data each source was last given, to spot annotation layers whose features changed. */
  let appliedData = new Map<string, LayerData>();
  /** The layer order last applied, as text, so we only reorder when it changes. */
  let appliedOrder = "";
  /** The selection highlight layers on the map, and what they were made from (as text). */
  let selectionSpecs: LayerSpecification[] = [];
  let appliedSelection = "";

  onMount(() => {
    currentBasemapId = basemap.id;
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
    scale = new ScaleControl({ unit: units });
    map.addControl(scale, "bottom-left");

    // A new basemap style wipes everything we added, so redo projection and layers.
    map.on("style.load", () => {
      map?.setProjection({ type: globe ? "globe" : "mercator" });
      const firstLoad = styleVersion === 0;
      applied = new Map();
      appliedData = new Map();
      appliedOrder = "";
      selectionSpecs = [];
      appliedSelection = "";
      styleVersion++;
      if (!firstLoad) onStyleLoad?.();
    });
    // Point-shape icons are made on demand, the first time a layer asks for one
    // (and again after a basemap switch, which drops all images).
    map.on("styleimagemissing", (e) => {
      const shape = shapeFromImageId(e.id);
      if (shape && !map?.hasImage(e.id)) {
        map?.addImage(e.id, shapeImage(shape), { sdf: true, pixelRatio: SHAPE_PIXEL_RATIO });
      }
    });
    onMapReady?.(map);
    map.on("mousemove", (e: MapMouseEvent) => {
      onCursor?.(e.lngLat);
      // A pointing-hand cursor over features hints that they can be clicked.
      if (cursorMode === "features") map!.getCanvas().style.cursor = featuresAt(e).length > 0 ? "pointer" : "";
      else if (cursorMode === "crosshair") map!.getCanvas().style.cursor = "crosshair";
    });
    map.on("click", (e: MapMouseEvent) => onFeatureClick?.(featuresAt(e)));
    map.on("mouseout", () => onCursor?.(null));
    map.on("zoom", () => onZoom?.(map!.getZoom()));
    onZoom?.(map.getZoom());
  });

  onDestroy(() => map?.remove());

  /**
   * Our data features near a mouse event, top first, each once. A few pixels
   * of slack make thin lines and small points easy to hit.
   */
  function featuresAt(e: MapMouseEvent): FeatureHit[] {
    if (!map) return [];
    const dataLayers = [...applied.values()].flat().map((spec) => spec.id);
    if (dataLayers.length === 0) return [];
    const { x, y } = e.point;
    const slack = 4;
    const found = map.queryRenderedFeatures(
      [
        [x - slack, y - slack],
        [x + slack, y + slack],
      ],
      { layers: dataLayers },
    );
    const hits: FeatureHit[] = [];
    const seen = new Set<string>();
    for (const feature of found) {
      const layerId = layerIdFromSource(feature.source);
      // A polygon shows up twice (fill and outline); keep the first.
      const key = `${layerId}/${feature.id}`;
      if (layerId === null || typeof feature.id !== "number" || seen.has(key)) continue;
      seen.add(key);
      hits.push({ layerId, featureId: feature.id });
    }
    return hits;
  }

  /**
   * The nearest vertex of a feature on the map within `pixels` of a position,
   * for snapping while drawing. `exclude` is the feature being edited, which
   * must not snap to itself.
   */
  export function snapToVertex(
    lng: number,
    lat: number,
    exclude: FeatureHit | null,
    pixels = 10,
  ): Position | undefined {
    if (!map) return undefined;
    const dataLayers = [...applied.values()].flat().map((spec) => spec.id);
    if (dataLayers.length === 0) return undefined;
    const { x, y } = map.project([lng, lat]);
    const box: [[number, number], [number, number]] = [
      [x - pixels, y - pixels],
      [x + pixels, y + pixels],
    ];
    let best: Position | undefined;
    let bestDistance = pixels;
    const seen = new Set<string>();
    for (const found of map.queryRenderedFeatures(box, { layers: dataLayers })) {
      const layerId = layerIdFromSource(found.source);
      const key = `${layerId}/${found.id}`;
      if (layerId === null || typeof found.id !== "number" || seen.has(key)) continue;
      seen.add(key);
      if (exclude && exclude.layerId === layerId && exclude.featureId === found.id) continue;
      // Use the original coordinates: the map's copy is simplified for drawing.
      const geometry = layers.find((l) => l.id === layerId)?.data.geojson.features[found.id]?.geometry;
      if (!geometry) continue;
      eachPosition(geometry, (position) => {
        const p = map!.project([position[0], position[1]]);
        const distance = Math.hypot(p.x - x, p.y - y);
        if (distance <= bestDistance) {
          bestDistance = distance;
          best = [position[0], position[1]];
        }
      });
    }
    return best;
  }

  /** How many degrees of longitude and latitude `pixels` covers at the centre of the map. */
  export function pixelsToDegrees(pixels: number): [number, number] {
    if (!map) return [0, 0];
    const { width, height } = map.getCanvas().getBoundingClientRect();
    const a = map.unproject([width / 2, height / 2]);
    const b = map.unproject([width / 2 + pixels, height / 2 + pixels]);
    return [b.lng - a.lng, b.lat - a.lat];
  }

  /**
   * Keeps the tools' layers above everything else: the measure tool's shape
   * ("measure-") and terra-draw's editing handles ("td-"), in that order.
   */
  function raiseEditingLayers(m: MapLibreMap) {
    const ids = m.getStyle().layers.map((layer) => layer.id);
    for (const prefix of ["measure-", "td-"]) {
      for (const id of ids) if (id.startsWith(prefix)) m.moveLayer(id);
    }
  }

  /** Zooms the map to show a box given as [minX, minY, maxX, maxY]. */
  export function fitBounds(bbox: [number, number, number, number], maxZoom = 16) {
    // Clamp to the range Web Mercator can show, so whole-world layers still fit.
    const [minX, minY, maxX, maxY] = bbox;
    map?.fitBounds(
      [
        [Math.max(minX, -180), Math.max(minY, -85)],
        [Math.min(maxX, 180), Math.min(maxY, 85)],
      ],
      { padding: 40, duration: 600, maxZoom },
    );
  }

  /** Zooms in (positive) or out (negative) by whole zoom levels, around the map's centre. */
  export function zoomBy(levels: number) {
    if (map) map.zoomTo(map.getZoom() + levels, { duration: 300 });
  }

  /** Where the map is looking now (saved in project files). */
  export function getView(): MapViewState {
    const center = map?.getCenter();
    return {
      center: center ? [center.lng, center.lat] : [0, 0],
      zoom: map?.getZoom() ?? 0,
      bearing: map?.getBearing() ?? 0,
      pitch: map?.getPitch() ?? 0,
    };
  }

  /** Jumps straight to a saved view (no animation). */
  export function setView(view: MapViewState) {
    map?.jumpTo({ center: view.center, zoom: view.zoom, bearing: view.bearing, pitch: view.pitch });
  }

  // Swap the basemap when the user picks a different one.
  $effect(() => {
    const { id, style } = basemap;
    if (map && id !== currentBasemapId) {
      currentBasemapId = id;
      // `diff: false` always loads the new style from scratch. Otherwise MapLibre
      // may patch the old style into the new one, which removes our layers
      // without the "style.load" event that tells us to add them back.
      map.setStyle(style, { diff: false });
    }
  });

  // MapLibre's scale bar has the same three unit systems as the measure tool.
  $effect(() => {
    scale?.setUnit(units);
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

  // Keep the selection highlight in step with the selection (and the layers,
  // since hiding or removing a layer hides its highlight).
  $effect(() => {
    void styleVersion;
    const layerId = selection.layerId;
    const ids = [...selection.ids];
    const owner = layers.find((layer) => layer.id === layerId && layer.visible && layer.id !== noHighlightLayerId);
    if (!map || styleVersion === 0) return;
    syncSelection(map, owner ? selectionLayersFor(owner.id, ids) : []);
  });

  /** Replaces the highlight layers when the selection changes, and keeps them on top. */
  function syncSelection(m: MapLibreMap, specs: LayerSpecification[]) {
    const key = JSON.stringify(specs);
    if (key === appliedSelection) return;
    for (const spec of selectionSpecs) m.removeLayer(spec.id);
    for (const spec of specs) m.addLayer(spec);
    raiseEditingLayers(m);
    selectionSpecs = specs;
    appliedSelection = key;
  }

  /** Adds, updates, reorders and removes our sources and style layers so the map shows exactly `wanted`. */
  function syncLayers(m: MapLibreMap, wanted: MapLayer[]) {
    // Remove layers that were closed.
    const wantedIds = new Set(wanted.map((layer) => layer.id));
    for (const [id, specs] of applied) {
      if (wantedIds.has(id)) continue;
      // MapLibre won't remove a source that's still drawn, so drop the
      // selection highlight first if it's on this layer.
      if (selectionSpecs.some((spec) => "source" in spec && spec.source === sourceId(id))) {
        for (const spec of selectionSpecs) m.removeLayer(spec.id);
        selectionSpecs = [];
        appliedSelection = "";
      }
      for (const spec of specs) m.removeLayer(spec.id);
      m.removeSource(sourceId(id));
      applied.delete(id);
      appliedData.delete(id);
    }

    for (const layer of wanted) {
      const filter = filterExpression(layer.filter, numericFieldsOf(layer.data));
      const next = styleLayersFor({ ...layer, filter, annotation: layer.annotations !== null });
      const previous = applied.get(layer.id);
      if (previous && appliedData.get(layer.id) !== layer.data) {
        // Annotation layers get new data after every edit.
        (m.getSource(sourceId(layer.id)) as GeoJSONSource | undefined)?.setData(layer.data.geojson as FeatureCollection);
      }
      appliedData.set(layer.id, layer.data);
      if (!previous) {
        // New layer: add its data and style layers.
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
      // The selection highlight stays above all data layers, and terra-draw's editing handles above that.
      for (const spec of selectionSpecs) m.moveLayer(spec.id);
      raiseEditingLayers(m);
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
