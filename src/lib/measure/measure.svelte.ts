/**
 * The measure tool: click points on the map to measure a distance (along a
 * line) or an area (inside a polygon). The reading updates as the mouse moves.
 * Double-click or Enter finishes; the next click starts a new measurement.
 * Backspace removes the last point and Esc clears.
 *
 * The numbers come from Rust (measureGeometry in api.ts), which measures on
 * the WGS84 ellipsoid. This class only collects points, draws the shape and
 * asks for the measurement.
 */
import type { Geometry, Position } from "geojson";
import type { Measurement } from "../api";
import type { GeoJSONSource, MapLibreMap, MapMouseEvent } from "../map/maplibre";
import { MEASURE_LAYERS, MEASURE_SOURCE, measuredGeometry, measureFeatures, type MeasureMode } from "./shape";
import type { UnitSystem } from "./units";

type Measurer = (geometry: Geometry) => Promise<Measurement>;

export class MeasureTool {
  active = $state(false);
  mode = $state<MeasureMode>("distance");
  units = $state<UnitSystem>("metric");
  /** The clicked points. */
  points = $state.raw<Position[]>([]);
  /** The mouse position while drawing; null when finished or off the map. */
  cursor = $state.raw<Position | null>(null);
  /** True once a shape is finished (double-click or Enter). */
  finished = $state(false);
  /** The latest measurement, or null when there's nothing to measure yet. */
  result = $state<Measurement | null>(null);

  #map: MapLibreMap | null = null;
  #measure: Measurer;
  /** Numbers each measurement request, so a slow old answer can't replace a newer one. */
  #request = 0;
  #updateQueued = false;

  constructor(measure: Measurer) {
    this.#measure = measure;
  }

  /** Connects the tool to the map. Its handlers do nothing while the tool is off. */
  attach(map: MapLibreMap) {
    this.#map = map;
    map.on("click", (e: MapMouseEvent) => {
      if (!this.active) return;
      if (this.finished) this.clear();
      this.points = [...this.points, [e.lngLat.lng, e.lngLat.lat]];
      this.#changed();
    });
    map.on("mousemove", (e: MapMouseEvent) => {
      if (!this.active || this.finished || this.points.length === 0) return;
      this.cursor = [e.lngLat.lng, e.lngLat.lat];
      this.#changed();
    });
    map.on("dblclick", (e: MapMouseEvent) => {
      if (!this.active) return;
      // Stop MapLibre zooming in on the double-click.
      e.preventDefault();
      // A double-click is also two clicks, which add the same point twice; drop the copy.
      const [before, last] = this.points.slice(-2);
      if (before && last && before[0] === last[0] && before[1] === last[1]) this.points = this.points.slice(0, -1);
      this.finish();
    });
    // A basemap switch wipes our source and layers; put them back.
    map.on("style.load", () => this.#draw());
  }

  start(mode: MeasureMode = this.mode) {
    this.active = true;
    this.setMode(mode);
    this.#map?.doubleClickZoom.disable();
  }

  stop() {
    this.clear();
    this.active = false;
    this.#map?.doubleClickZoom.enable();
  }

  setMode(mode: MeasureMode) {
    this.mode = mode;
    this.clear();
  }

  /** Starts again with no points. */
  clear() {
    this.points = [];
    this.cursor = null;
    this.finished = false;
    this.#changed();
  }

  /** Finishes the shape: the reading stops following the mouse. */
  finish() {
    this.cursor = null;
    this.finished = this.points.length > 0;
    this.#changed();
  }

  /** Removes the last clicked point. */
  undoPoint() {
    this.points = this.points.slice(0, -1);
    this.finished = false;
    this.#changed();
  }

  /** Redraws and re-measures, at most once per frame (mouse moves come fast). */
  #changed() {
    if (this.#updateQueued) return;
    this.#updateQueued = true;
    requestAnimationFrame(() => {
      this.#updateQueued = false;
      this.#draw();
      void this.#remeasure();
    });
  }

  async #remeasure() {
    const geometry = this.active ? measuredGeometry(this.mode, this.points, this.cursor) : null;
    const request = ++this.#request;
    if (!geometry) {
      this.result = null;
      return;
    }
    try {
      const result = await this.#measure(geometry);
      if (request === this.#request) this.result = result;
    } catch {
      if (request === this.#request) this.result = null;
    }
  }

  /** Shows the shape on the map, adding the source and layers the first time. */
  #draw() {
    const map = this.#map;
    if (!map || !map.isStyleLoaded()) return;
    const data = measureFeatures(this.mode, this.active ? this.points : [], this.active ? this.cursor : null);
    const source = map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      map.addSource(MEASURE_SOURCE, { type: "geojson", data });
      // Added last, so on top. MapView keeps "measure-" layers on top after that.
      for (const layer of MEASURE_LAYERS) map.addLayer(layer);
    }
  }
}
