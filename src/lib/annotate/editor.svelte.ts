/**
 * The annotation editor: draws and edits the features of one annotation layer
 * at a time, using terra-draw (https://terradraw.io).
 *
 * How the pieces fit:
 * - The layer's features live in the LayerList (MapLayer.annotations), and
 *   the layer's own MapLibre style layers draw them, with their real colours,
 *   markers and text, whether or not they're being edited.
 * - While a layer is edited, terra-draw holds a copy of its shapes and draws
 *   thin outlines and drag handles on top. When terra-draw changes a shape,
 *   the new geometry is copied back into the LayerList (`#sync`), so the real
 *   rendering follows the mouse. Properties (name, colours...) stay in the
 *   LayerList; terra-draw only knows shapes.
 * - Every finished change goes on the undo History as a command that swaps
 *   the layer's whole feature list (see history.svelte.ts).
 *
 * Feature ids: annotations keep stable UUIDs (terra-draw needs them). The
 * Selection store uses positions, like everywhere else, so selections are
 * converted between the two here.
 */
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
  type SnapToCustom,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Position } from "geojson";
import type { History } from "../history.svelte";
import type { LayerList } from "../layers.svelte";
import type { MapLibreMap } from "../map/maplibre";
import type { MapLayer } from "../map/types";
import type { Selection } from "../selection.svelte";
import { kindForMode, mergeEdits, type EditedFeature } from "./data";
import type { AnnotationFeature, AnnotationGeometry, AnnotationKind, AnnotationProperties } from "./types";

/** The tools, in toolbar order. Each id is also the terra-draw mode name. */
export const TOOLS = [
  { id: "select", label: "Select and edit", icon: "⬚" },
  { id: "point", label: "Point", icon: "•" },
  { id: "marker", label: "Marker", icon: "★" },
  { id: "text", label: "Text", icon: "T" },
  { id: "linestring", label: "Line (click points, click the last one again to finish)", icon: "╱" },
  { id: "polygon", label: "Polygon (click points, click the first one to close)", icon: "⬠" },
  { id: "rectangle", label: "Rectangle", icon: "▭" },
  { id: "circle", label: "Circle", icon: "◯" },
  { id: "freehand", label: "Freehand shape", icon: "✎" },
] as const;
export type Tool = (typeof TOOLS)[number]["id"];

/** Names for history entries, e.g. "Draw polygon". */
export const KIND_LABELS: Record<AnnotationKind, string> = {
  point: "point",
  marker: "marker",
  text: "text",
  line: "line",
  polygon: "polygon",
  rectangle: "rectangle",
  circle: "circle",
  freehand: "freehand shape",
};

/** History labels for terra-draw's kinds of edit (its "finish" actions). Rotating and scaling count as "edit". */
const EDIT_LABELS: Record<string, string> = {
  dragFeature: "Move annotation",
  dragCoordinate: "Move vertex",
  insertMidpoint: "Add vertex",
  deleteCoordinate: "Delete vertex",
  dragCoordinateResize: "Resize annotation",
};

/** Finds a vertex of another feature near a position, for snapping. */
export type SnapFunction = (lng: number, lat: number, exclude: { layerId: string; featureId: number } | null) => Position | undefined;

/** terra-draw's outlines and handles. Kept thin: the layer's own style shows the real look underneath. */
const EDIT_COLOR = "#0969da";
const WHITE = "#ffffff";

/** The terra-draw mode an existing feature is loaded with, from its geometry. */
const modeForGeometry = (geometry: AnnotationGeometry) =>
  geometry.type === "Point" ? "point" : geometry.type === "LineString" ? "linestring" : "polygon";

/** Helper features terra-draw adds while editing (vertex handles, midpoints...). */
const isGuidance = (f: GeoJSONStoreFeatures) =>
  Boolean(
    f.properties.midPoint ||
      f.properties.selectionPoint ||
      f.properties.coordinatePoint ||
      f.properties.snappingPoint ||
      f.properties.closingPoint,
  );

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True if two feature lists have the same shapes in the same order (properties may differ). */
const sameShapes = (a: AnnotationFeature[], b: AnnotationFeature[]) =>
  a.length === b.length && a.every((f, i) => f.id === b[i].id && sameJson(f.geometry, b[i].geometry));

export class AnnotationEditor {
  /** The annotation layer being edited, or null when not editing. */
  layerId = $state<string | null>(null);
  tool = $state<Tool>("select");
  /** Snap new and moved vertices to nearby vertices of other features. */
  snapping = $state(true);
  /** Features of the edited layer terra-draw couldn't load (e.g. self-crossing shapes); shown but not editable. */
  uneditable = $state(0);
  /** A just-placed text annotation whose text box should get the keyboard focus. */
  focusTextOf = $state<string | null>(null);

  #list: LayerList;
  #history: History;
  #selection: Selection;
  #snap: SnapFunction;
  #map: MapLibreMap | null = null;
  #draw: TerraDraw | null = null;
  /** The edited layer's features as of the last history entry. */
  #committed: AnnotationFeature[] = [];
  /** Ids of features terra-draw rejected; they're kept as they are. */
  #kept = new Set<string>();
  /**
   * True while the editor itself is changing terra-draw (loading features,
   * selecting), so the events terra-draw sends back about it are ignored.
   * Without this, deselecting the old feature to select a new one would clear
   * the whole selection.
   */
  #quiet = false;
  /** The feature terra-draw has selected (it selects one at a time). */
  #drawSelected: string | null = null;
  #syncQueued = false;

  constructor(options: { list: LayerList; history: History; selection: Selection; snap: SnapFunction }) {
    this.#list = options.list;
    this.#history = options.history;
    this.#selection = options.selection;
    this.#snap = options.snap;
  }

  /** Gives the editor the map once it exists. */
  attach(map: MapLibreMap) {
    this.#map = map;
  }

  #layer(id: string | null): MapLayer | undefined {
    return this.#list.layers.find((l) => l.id === id);
  }

  // --- Starting and stopping ----------------------------------------------------

  /** Starts editing an annotation layer (stopping any other first). */
  start(layerId: string) {
    const layer = this.#layer(layerId);
    if (!this.#map || !layer?.annotations) return;
    this.stop();
    if (!layer.visible) this.#list.update(layerId, { visible: true });
    this.layerId = layerId;
    this.#draw = this.#createDraw(this.#map);
    this.#draw.start();
    this.#load(layer.annotations);
    this.#committed = layer.annotations;
    this.#draw.setMode(this.tool);
    this.followSelection();
  }

  /** Stops editing. A shape that was half drawn is dropped. */
  stop() {
    if (this.#draw) {
      try {
        this.#draw.stop();
      } catch {
        // After a basemap switch terra-draw's map layers are already gone; nothing to clean up.
      }
    }
    this.#draw = null;
    this.layerId = null;
    this.#kept = new Set();
    this.#drawSelected = null;
    this.uneditable = 0;
  }

  /** A basemap switch wipes terra-draw's map layers, so start again on the same layer. */
  restartAfterStyleChange() {
    const id = this.layerId;
    if (id) this.start(id);
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.#draw?.setMode(tool);
  }

  // --- terra-draw -----------------------------------------------------------------

  #createDraw(map: MapLibreMap): TerraDraw {
    // Snapping goes through our own function (see MapView.snapToVertex), so it
    // can snap to any layer on the map, not just to the shapes terra-draw holds.
    const toCustom: SnapToCustom = (event, context) => {
      if (!this.snapping) return undefined;
      const current = context.currentId !== undefined ? this.#indexOf(String(context.currentId)) : -1;
      const exclude = current >= 0 && this.layerId ? { layerId: this.layerId, featureId: current } : null;
      return this.#snap(event.lng, event.lat, exclude);
    };
    const snapping = { toCustom };
    const outline = { outlineColor: EDIT_COLOR, outlineWidth: 1.5, fillColor: EDIT_COLOR, fillOpacity: 0.04 } as const;
    const line = { lineStringColor: EDIT_COLOR, lineStringWidth: 1.5 } as const;
    const point = { pointColor: EDIT_COLOR, pointWidth: 3, pointOutlineColor: WHITE, pointOutlineWidth: 1 } as const;
    const handles = {
      closingPointColor: WHITE,
      closingPointOutlineColor: EDIT_COLOR,
      closingPointWidth: 4,
      closingPointOutlineWidth: 2,
      snappingPointColor: WHITE,
      snappingPointOutlineColor: EDIT_COLOR,
      snappingPointWidth: 4,
      snappingPointOutlineWidth: 2,
    } as const;

    // What can be done to each kind of feature in select mode. Rectangles and
    // circles are resized from their corners/edge rather than vertex by vertex.
    const shape = {
      feature: {
        draggable: true,
        rotateable: true,
        scaleable: true,
        coordinates: { draggable: true, midpoints: true, deletable: true, snappable: snapping },
      },
    };
    const resizable = (resizable: "opposite" | "center") => ({
      feature: { draggable: true, rotateable: true, scaleable: true, coordinates: { resizable, draggable: false } },
    });
    const movable = { feature: { draggable: true } };

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: "td" }),
      modes: [
        new TerraDrawSelectMode({
          flags: {
            point: movable,
            marker: movable,
            text: movable,
            linestring: shape,
            polygon: shape,
            freehand: shape,
            rectangle: resizable("opposite"),
            circle: resizable("center"),
          },
          // Delete is handled by the app (so it can be undone); Alt/Option+drag rotates.
          keyEvents: { deselect: "Escape", delete: null, rotate: ["Alt"], scale: null },
          styles: {
            selectedPolygonColor: EDIT_COLOR,
            selectedPolygonFillOpacity: 0.08,
            selectedPolygonOutlineColor: EDIT_COLOR,
            selectedPolygonOutlineWidth: 2,
            selectedLineStringColor: EDIT_COLOR,
            selectedLineStringWidth: 2,
            selectedPointColor: EDIT_COLOR,
            selectedPointWidth: 5,
            selectedPointOutlineColor: WHITE,
            selectedPointOutlineWidth: 2,
            selectionPointColor: WHITE,
            selectionPointWidth: 4,
            selectionPointOutlineColor: EDIT_COLOR,
            selectionPointOutlineWidth: 2,
            midPointColor: EDIT_COLOR,
            midPointWidth: 3,
            midPointOutlineColor: WHITE,
            midPointOutlineWidth: 1,
          },
        }),
        new TerraDrawPointMode({ modeName: "point", styles: point }),
        new TerraDrawPointMode({ modeName: "marker", styles: point }),
        new TerraDrawPointMode({ modeName: "text", styles: point }),
        new TerraDrawLineStringMode({ snapping, styles: { ...line, ...handles } }),
        new TerraDrawPolygonMode({ snapping, styles: { ...outline, ...handles } }),
        new TerraDrawRectangleMode({ styles: outline }),
        new TerraDrawCircleMode({ styles: outline }),
        new TerraDrawFreehandMode({ styles: { ...outline, closingPointColor: WHITE, closingPointOutlineColor: EDIT_COLOR } }),
      ],
    });
    // terra-draw reports what happens through events; pass them to the handlers below.
    draw.on("change", () => this.onChange());
    draw.on("finish", (id, context) => this.onFinish(String(id), context.mode, context.action));
    draw.on("select", (id) => this.onSelect(String(id)));
    draw.on("deselect", () => this.onDeselect());
    return draw;
  }

  /** Loads features into terra-draw, remembering the ones it refuses. */
  #load(features: AnnotationFeature[]) {
    const draw = this.#draw;
    if (!draw) return;
    this.#quiet = true;
    try {
      draw.clear();
      const results = draw.addFeatures(
        features.map((f) => ({
          type: "Feature",
          id: f.id,
          geometry: f.geometry,
          properties: { mode: modeForGeometry(f.geometry) },
        })),
      );
      this.#kept = new Set(results.filter((r) => !r.valid).map((r) => String(r.id)));
    } finally {
      this.#quiet = false;
    }
    this.uneditable = this.#kept.size;
    this.#drawSelected = null;
  }

  /** terra-draw changed something. */
  onChange() {
    if (this.#quiet || !this.#draw) return;
    // While a new shape is being drawn terra-draw shows it itself; the layer gets it when it's finished.
    if (this.#draw.getModeState() === "drawing") return;
    this.#queueSync();
  }

  onFinish(id: string, mode: string, action: string) {
    if (this.#quiet) return;
    if (action !== "draw") {
      this.#commit(EDIT_LABELS[action] ?? "Edit annotation");
      return;
    }
    const kind = kindForMode(mode);
    this.#commit(`Draw ${KIND_LABELS[kind]}`);
    if (kind === "text") {
      // Text needs typing: switch to Select with the new text selected, so its text box shows.
      this.setTool("select");
      this.#selection.select(this.layerId!, [this.#indexOf(id)]);
      this.followSelection();
      this.focusTextOf = id;
    }
  }

  onSelect(id: string) {
    if (this.#quiet || !this.layerId) return;
    this.#drawSelected = id;
    const index = this.#indexOf(id);
    const already = this.#selection.layerId === this.layerId && this.#selection.count === 1 && this.#selection.ids.has(index);
    if (index >= 0 && !already) this.#selection.select(this.layerId, [index], index);
  }

  onDeselect() {
    if (this.#quiet || !this.layerId) return;
    this.#drawSelected = null;
    if (this.#selection.layerId === this.layerId) this.#selection.clear();
  }

  /**
   * Makes terra-draw select what the Selection store says (after a click in the
   * attribute table, say). terra-draw selects one feature at a time.
   */
  followSelection() {
    const draw = this.#draw;
    const layer = this.#layer(this.layerId);
    if (!draw || !layer?.annotations || this.tool !== "select") return;
    const wanted =
      this.#selection.layerId === layer.id && this.#selection.count === 1
        ? layer.annotations[[...this.#selection.ids][0]]?.id ?? null
        : null;
    if (wanted === this.#drawSelected) return;
    this.#quiet = true;
    try {
      if (this.#drawSelected && draw.hasFeature(this.#drawSelected)) draw.deselectFeature(this.#drawSelected);
      if (wanted && draw.hasFeature(wanted)) draw.selectFeature(wanted);
    } finally {
      this.#quiet = false;
    }
    this.#drawSelected = wanted;
  }

  #indexOf(id: string): number {
    return this.#layer(this.layerId)?.annotations?.findIndex((f) => f.id === id) ?? -1;
  }

  /** Copies terra-draw's shapes into the layer, at most once per frame. */
  #queueSync() {
    if (this.#syncQueued) return;
    this.#syncQueued = true;
    requestAnimationFrame(() => {
      this.#syncQueued = false;
      this.#sync();
    });
  }

  #sync() {
    const draw = this.#draw;
    const layer = this.#layer(this.layerId);
    if (!draw || !layer?.annotations) return;
    const edited: EditedFeature[] = draw
      .getSnapshot()
      .filter((f) => !isGuidance(f) && !f.properties.currentlyDrawing)
      .map((f) => ({ id: String(f.id), geometry: f.geometry as AnnotationGeometry, mode: String(f.properties.mode) }));
    const merged = mergeEdits(layer.annotations, edited, this.#kept);
    if (!sameJson(merged, layer.annotations)) this.#setFeatures(layer.id, merged);
  }

  /** Records what changed since the last history entry as one undoable step. */
  #commit(label: string) {
    this.#sync();
    const layerId = this.layerId;
    const after = this.#layer(layerId)?.annotations;
    if (!layerId || !after || sameJson(after, this.#committed)) return;
    this.#record(layerId, this.#committed, after, label);
    this.#committed = after;
  }

  #record(layerId: string, before: AnnotationFeature[], after: AnnotationFeature[], label: string) {
    this.#history.push({
      label,
      undo: () => this.setFeatures(layerId, before),
      redo: () => this.setFeatures(layerId, after),
    });
  }

  // --- Changes from outside terra-draw (undo, properties, paste, delete...) -------

  /**
   * Replaces a layer's features, keeping the selection on the same features
   * (by id) even if their positions in the list changed.
   */
  #setFeatures(layerId: string, features: AnnotationFeature[]) {
    const before = this.#layer(layerId)?.annotations;
    if (!before) return;
    const selectedIds =
      this.#selection.layerId === layerId ? [...this.#selection.ids].map((i) => before[i]?.id).filter(Boolean) : null;
    this.#list.setAnnotations(layerId, features);
    if (selectedIds) {
      const positions = selectedIds.map((id) => features.findIndex((f) => f.id === id)).filter((i) => i >= 0);
      if (positions.length > 0) this.#selection.select(layerId, positions);
      else this.#selection.clear();
    }
  }

  /** Sets a layer's features without recording history (used by undo/redo). */
  setFeatures(layerId: string, features: AnnotationFeature[]) {
    const before = this.#layer(layerId)?.annotations;
    if (!before) return;
    this.#setFeatures(layerId, features);
    if (layerId === this.layerId) {
      // Reload terra-draw only if shapes changed; property edits don't concern it.
      if (!sameShapes(before, features)) this.#load(features);
      this.#committed = features;
      this.followSelection();
    }
  }

  /** Changes a layer's features as one undoable step. */
  change(layerId: string, after: AnnotationFeature[], label: string) {
    if (layerId === this.layerId) this.#commit("Edit annotation"); // anything still pending in terra-draw
    const before = this.#layer(layerId)?.annotations;
    if (!before || sameJson(before, after)) return;
    this.setFeatures(layerId, after);
    this.#record(layerId, before, after, label);
  }

  /** Changes one feature's properties as an undoable step. `undefined` values remove a property. */
  updateProperties(layerId: string, featureId: string, changes: Partial<AnnotationProperties>, label: string) {
    const features = this.#layer(layerId)?.annotations;
    if (!features) return;
    const after = features.map((f) => {
      if (f.id !== featureId) return f;
      const properties = { ...f.properties, ...changes };
      for (const key of Object.keys(changes) as (keyof AnnotationProperties)[]) {
        if (changes[key] === undefined) delete properties[key];
      }
      return { ...f, properties };
    });
    this.change(layerId, after, label);
  }
}

