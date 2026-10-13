<script lang="ts">
  import { onMount, untrack } from "svelte";
  import MapView from "./lib/map/MapView.svelte";
  import BasemapPicker from "./lib/map/BasemapPicker.svelte";
  import OfflineHelp from "./lib/map/OfflineHelp.svelte";
  import { OFFLINE_BASEMAP_ID } from "./lib/map/basemaps";
  import { DEFAULT_FLAVOR, labelLanguage, offlineBasemap, protomapsScheme } from "./lib/map/offline";
  import type { FeatureHit, MapLayer } from "./lib/map/types";
  import { MapDocument } from "./lib/document.svelte";
  import { featuresBbox, numericFieldsOf, unionBbox } from "./lib/features";
  import { filterPredicate } from "./lib/filter";
  import IdentifyPanel from "./lib/identify/IdentifyPanel.svelte";
  import FilterEditor from "./lib/panel/FilterEditor.svelte";
  import LayerPanel from "./lib/panel/LayerPanel.svelte";
  import MissingLayers from "./lib/panel/MissingLayers.svelte";
  import StyleEditor from "./lib/panel/StyleEditor.svelte";
  import SearchBox from "./lib/search/SearchBox.svelte";
  import type { SearchHit } from "./lib/search/search";
  import { Selection } from "./lib/selection.svelte";
  import AttributeTable from "./lib/table/AttributeTable.svelte";
  import AnnotationProperties from "./lib/annotate/AnnotationProperties.svelte";
  import AnnotationToolbar from "./lib/annotate/AnnotationToolbar.svelte";
  import { annotationsFromFeatures, offset, withNewIds } from "./lib/annotate/data";
  import { AnnotationEditor } from "./lib/annotate/editor.svelte";
  import type { AnnotationFeature } from "./lib/annotate/types";
  import { History } from "./lib/history.svelte";
  import MeasurePanel from "./lib/measure/MeasurePanel.svelte";
  import { MeasureTool } from "./lib/measure/measure.svelte";
  import StatsPanel from "./lib/panel/StatsPanel.svelte";
  import { formatLngLat } from "./lib/util/coords";
  import { describeLayer } from "./lib/util/layerSummary";
  import { basemapOrDefault, fileName, sortPaths, UNTITLED, withProjectExtension } from "./lib/project";
  import { readRecent, recentLabel, withoutRecent, withRecent, writeRecent } from "./lib/recent";
  import { Preferences, readPreferences, writePreferences } from "./lib/preferences.svelte";
  import {
    commandForKey,
    isMac,
    isTextEntry,
    menuTemplate,
    SHORTCUTS,
    shortcutLabel,
    TEXT_EDITING,
    type CommandId,
  } from "./lib/shell/commands";
  import { NativeMenu } from "./lib/shell/menu";
  import MenuBar from "./lib/shell/MenuBar.svelte";
  import AboutDialog from "./lib/shell/AboutDialog.svelte";
  import PreferencesDialog from "./lib/shell/PreferencesDialog.svelte";
  import ShortcutsDialog from "./lib/shell/ShortcutsDialog.svelte";
  import { applyTheme, type Theme } from "./lib/shell/theme";
  import {
    askToSaveChanges,
    exportLayer,
    getAppInfo,
    inDesktopApp,
    loadProject,
    measureGeometry,
    onFileDrag,
    onWindowClose,
    openFile,
    openTiles,
    pickExportPath,
    pickFilesToOpen,
    pickProjectSavePath,
    pickTilesFile,
    PROJECT_EXTENSION,
    quitApp,
    saveProject,
    setAppTheme,
    setWindowTitle,
    type AppInfo,
    type LayerData,
  } from "./lib/api";

  /** Theme, units, coordinate format and the default basemap, kept between runs (lib/preferences.svelte.ts). */
  const prefs = new Preferences(readPreferences());
  /** The open project: layers, basemap, globe, file path, unsaved changes (lib/document.svelte.ts). */
  const doc = new MapDocument(prefs.basemap);
  const list = doc.layers;
  /** Where the bundled Protomaps icon sheets are (public/basemap/), as an absolute URL. */
  const SPRITES = new URL("basemap/sprites/v4", document.baseURI).href;
  /** Offline Protomaps maps label places in the computer's language when they can. */
  const LABEL_LANGUAGE = labelLanguage(navigator.language);
  /** The basemap on the map. An offline map that couldn't be opened shows the default instead. */
  let basemap = $derived(
    doc.basemapId === OFFLINE_BASEMAP_ID && doc.offlineInfo
      ? offlineBasemap(doc.offlineInfo, doc.offlineMap?.flavor ?? DEFAULT_FLAVOR, SPRITES, LABEL_LANGUAGE)
      : basemapOrDefault(doc.basemapId),
  );
  /** Selected features, highlighted on the map and in the attribute table. */
  const selection = new Selection();

  /** Features under the last map click (top first), and which one the identify panel shows. */
  let identifyHits = $state<FeatureHit[]>([]);
  let identifyIndex = $state(0);
  /** The layer shown in the attribute table, or null when the table is closed. */
  let tableLayerId = $state<string | null>(null);
  let tableLayer = $derived(list.layers.find((l) => l.id === tableLayerId) ?? null);
  /** Height of the attribute table panel in pixels; drag its top edge to change it. */
  let tableHeight = $state(260);

  /** Undo/redo for annotation edits (lib/history.svelte.ts). */
  const history = new History();
  /** Draws and edits annotation layers with terra-draw (lib/annotate/editor.svelte.ts). */
  const editor = new AnnotationEditor({
    list,
    history,
    selection,
    snap: (lng, lat, exclude) => mapView?.snapToVertex(lng, lat, exclude),
  });
  /** The measure tool (lib/measure/measure.svelte.ts); its numbers come from Rust. */
  const measure = new MeasureTool(measureGeometry);
  /** The annotation layer being edited, if any. */
  let editingLayer = $derived(list.layers.find((l) => l.id === editor.layerId) ?? null);
  /** Copied features, ready to paste into an annotation layer. */
  let clipboard = $state.raw<AnnotationFeature[]>([]);
  /** The one selected annotation, for its properties panel. */
  let selectedAnnotation = $derived.by(() => {
    if (selection.count !== 1) return null;
    const layer = list.layers.find((l) => l.id === selection.layerId);
    const feature = layer?.annotations?.[[...selection.ids][0]];
    return layer && feature ? { layer, feature } : null;
  });

  let cursor = $state<{ lng: number; lat: number } | null>(null);
  let zoom = $state(0);
  let info = $state<AppInfo | null>(null);
  /** Recently opened or saved projects, newest first. */
  let recent = $state(readRecent());
  /** True while opening or saving, to ignore clicks until it's done. */
  let busy = $state(false);
  /** The latest status-bar message, and whether it's an error. */
  let message = $state<{ text: string; error: boolean } | null>(null);
  /** The dialog box being shown, if any. */
  let dialog = $state<"about" | "preferences" | "shortcuts" | "offlineHelp" | null>(null);
  /** True while files are dragged over the window. */
  let dragging = $state(false);

  let mapView: MapView;
  let searchBox: SearchBox;

  let cursorText = $derived(cursor ? formatLngLat(cursor.lng, cursor.lat, prefs.coordFormat) : "—");

  // Remember preferences whenever one changes, and apply the theme.
  $effect(() => writePreferences(prefs.values()));
  $effect(() => {
    applyTheme(prefs.theme);
    void setAppTheme(prefs.theme === "system" ? null : prefs.theme);
  });

  // Window title like "trip • — SmartMap"; the dot means unsaved changes.
  $effect(() => {
    void setWindowTitle(`${doc.name}${doc.dirty ? " •" : ""} — SmartMap`);
  });

  onMount(() => {
    getAppInfo().then((i) => (info = i));
    // Closing the window with unsaved changes asks first. Keeping the window
    // open is done by calling preventDefault() on the close event.
    const listening = onWindowClose(async (event) => {
      if (!(await confirmDiscard())) event.preventDefault();
    });
    // Files dropped on the window are opened like File → Open (desktop app only).
    const dragListening = onFileDrag((drag) => {
      if (drag.type === "enter") dragging = true;
      else if (drag.type === "leave") dragging = false;
      else if (drag.type === "drop") {
        dragging = false;
        exclusive(() => openPaths(drag.paths));
      }
    });
    return () => {
      void listening.then((stop) => stop());
      void dragListening.then((stop) => stop());
    };
  });

  const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** Shows a message and returns false when not in the desktop app (`npm run dev` in a browser). */
  function needsDesktop(what: string): boolean {
    if (!inDesktopApp) message = { text: `${what} needs the desktop app (npm run app:dev).`, error: true };
    return inDesktopApp;
  }

  /** Runs one file action at a time; clicks and shortcuts while one is running are ignored. */
  async function exclusive(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }

  function remember(path: string) {
    recent = withRecent(recent, path);
    writeRecent(recent);
  }

  /**
   * If there are unsaved changes, asks whether to save them. Returns true when
   * it's fine to carry on (saved, or the user chose not to), false to stop.
   */
  async function confirmDiscard(): Promise<boolean> {
    if (!doc.dirty) return true;
    const choice = await askToSaveChanges(doc.name);
    if (choice === "save") return save();
    return choice === "discard";
  }

  // --- File actions -----------------------------------------------------------

  /** File → New: close the current project (asking about changes) and start empty. */
  async function newProject() {
    if (!(await confirmDiscard())) return;
    editor.stop();
    history.clear();
    doc.reset(prefs.basemap);
    message = null;
  }

  /** Quit (Exit on Windows/Linux): asks about unsaved changes, then closes the app. */
  async function quit() {
    if (await confirmDiscard()) await quitApp();
  }

  /** File → Open: projects replace the current one, data files are added as layers. */
  async function openFiles() {
    if (!needsDesktop("Opening files")) return;
    await openPaths(await pickFilesToOpen());
  }

  /**
   * Opens chosen or dropped files: a project replaces the current one, an
   * offline map (PMTiles/MBTiles) becomes the basemap, and data files are
   * added as layers. Anything else is listed in the status bar.
   */
  async function openPaths(paths: string[]) {
    const { projects, data, tiles, unsupported } = sortPaths(paths);
    if (projects.length > 0 && (await openProject(projects[0])) !== "opened") return;
    if (tiles.length > 0) await showOfflineMap(tiles[0]);
    if (data.length > 0) await addDataFiles(data);

    const notes: string[] = [];
    const names = (list: string[]) => list.map(fileName).join(", ");
    if (projects.length > 1) notes.push(`Only one project can be open, so ${names(projects.slice(1))} wasn't opened`);
    if (tiles.length > 1) notes.push(`Only one offline map is used, so ${names(tiles.slice(1))} wasn't opened`);
    if (unsupported.length > 0) notes.push(`SmartMap can't open ${names(unsupported)}`);
    if (notes.length > 0) {
      const opened = projects.length + tiles.length + data.length > 0 && message ? [message.text] : [];
      message = { text: [...opened, ...notes].join(" · "), error: true };
    }
  }

  /** Opens a project from the Recent list, dropping it from the list if it can't be read. */
  async function openRecent(path: string) {
    if (!needsDesktop("Opening projects")) return;
    if ((await openProject(path)) === "failed") {
      recent = withoutRecent(recent, path);
      writeRecent(recent);
    }
  }

  /** Replaces the current project with the one at `path`. */
  async function openProject(path: string): Promise<"opened" | "cancelled" | "failed"> {
    if (!(await confirmDiscard())) return "cancelled";
    try {
      const project = await loadProject(path);
      editor.stop();
      history.clear();
      // Go to the saved view straight away, while the layers load.
      mapView.setView(project.view);
      const problems = await doc.load(project, path, openFile, openTiles);
      remember(path);
      const opened = project.layers.length - problems.length;
      message =
        problems.length === 0
          ? { text: `Opened ${fileName(path)}: ${opened} ${opened === 1 ? "layer" : "layers"}`, error: false }
          : {
              text:
                `${problems.length} of ${project.layers.length} layers couldn't be opened: ` +
                problems.map((p) => `${p.layer.name} (${p.reason})`).join(" · "),
              error: true,
            };
      if (doc.offlineProblem) {
        const note = `The offline map couldn't be opened, so the default basemap is showing. ${doc.offlineProblem}`;
        message = { text: problems.length === 0 ? note : `${message.text} · ${note}`, error: true };
      }
      return "opened";
    } catch (error) {
      message = { text: errorText(error), error: true };
      return "failed";
    }
  }

  /** Asks for a PMTiles or MBTiles file and shows it as the basemap. */
  async function openOfflineMap() {
    const path = await pickTilesFile();
    if (path) await showOfflineMap(path);
  }

  /** Opens a PMTiles or MBTiles file and shows it as the basemap. */
  async function showOfflineMap(path: string) {
    try {
      const tiles = await openTiles(path);
      doc.useOfflineMap(tiles);
      // Go to the map's area, unless it covers (nearly) the whole world.
      if (tiles.bounds && tiles.bounds[2] - tiles.bounds[0] < 300) mapView.fitBounds(tiles.bounds, tiles.maxZoom);
      const summary = `Basemap: ${fileName(tiles.path)} (${tiles.name}, ${tiles.format}, zoom ${tiles.minZoom}–${tiles.maxZoom})`;
      message =
        protomapsScheme(tiles) === "old"
          ? {
              text: `${summary}. It's an older Protomaps map (version ${tiles.version}), shown in plain greys; a new extract gets the full style.`,
              error: true,
            }
          : { text: summary, error: false };
    } catch (error) {
      message = { text: errorText(error), error: true };
    }
  }

  /** Loads data files and adds their layers on top. */
  async function addDataFiles(paths: string[]) {
    const notes: string[] = [];
    let lastBbox: MapLayer["data"]["bbox"] = null;
    let failed = false;

    for (const path of paths) {
      try {
        // One file can hold several layers (a GeoPackage with many tables).
        for (const data of await openFile(path)) {
          list.add(data);
          lastBbox = data.bbox ?? lastBbox;
          notes.push(describeLayer(data));
          if (data.warnings.length > 0) failed = true;
        }
      } catch (error) {
        failed = true;
        notes.push(errorText(error));
      }
    }

    message = { text: notes.join(" · "), error: failed };
    if (lastBbox) mapView.fitBounds(lastBbox);
  }

  /** File → Save. Returns true if the project was saved. */
  async function save(): Promise<boolean> {
    return doc.path ? writeProject(doc.path) : saveAs();
  }

  /** File → Save As: pick where to save. Returns true if the project was saved. */
  async function saveAs(): Promise<boolean> {
    if (!needsDesktop("Saving projects")) return false;
    const chosen = await pickProjectSavePath(doc.path ?? `${UNTITLED}.${PROJECT_EXTENSION}`);
    return chosen ? writeProject(withProjectExtension(chosen)) : false;
  }

  async function writeProject(path: string): Promise<boolean> {
    try {
      await saveProject(path, doc.toProject(mapView.getView()));
      doc.markSaved(path);
      remember(path);
      message = { text: `Saved ${fileName(path)}`, error: false };
      return true;
    } catch (error) {
      message = { text: errorText(error), error: true };
      return false;
    }
  }

  // Debug hook for `npm run dev` in a plain browser, where the Open dialog can't work:
  // `__smartmapAddLayer(await (await fetch("/some.json")).json())` in the console,
  // with JSON from the dump_layer example (a list of layers).
  if (import.meta.env.DEV && !inDesktopApp) {
    (window as unknown as Record<string, unknown>).__smartmapAddLayer = (data: LayerData | LayerData[]) => {
      const loaded = Array.isArray(data) ? data : [data];
      loaded.forEach((d) => list.add(d));
      message = { text: loaded.map(describeLayer).join(" · "), error: loaded.some((d) => d.warnings.length > 0) };
      const bbox = [...loaded].reverse().find((d) => d.bbox)?.bbox;
      if (bbox) mapView.fitBounds(bbox);
    };
  }

  function zoomToLayer(layer: MapLayer) {
    if (layer.data.bbox) mapView.fitBounds(layer.data.bbox);
  }

  /** View → Zoom to Full Extent: shows every visible layer, or the whole world if there are none. */
  function zoomToAll() {
    const bbox = unionBbox(list.layers.filter((l) => l.visible).map((l) => l.data.bbox));
    mapView.fitBounds(bbox ?? [-180, -60, 180, 75]);
  }

  // --- Identify, selection and the attribute table ----------------------------

  // When layers change (removed, filtered, a new project), forget what refers
  // to features that are gone or no longer shown.
  $effect(() => {
    const layers = list.layers;
    untrack(() => {
      // Keep identify results only for features still on the map (layer there, visible, passing its filter).
      identifyHits = identifyHits.filter((hit) => {
        const layer = layers.find((l) => l.id === hit.layerId);
        if (!layer?.visible) return false;
        const keep = filterPredicate(layer.filter, numericFieldsOf(layer.data));
        return keep(layer.data.geojson.features[hit.featureId]?.properties);
      });
      if (tableLayerId !== null && !layers.some((l) => l.id === tableLayerId)) tableLayerId = null;
      if (editor.layerId !== null && !layers.some((l) => l.id === editor.layerId)) editor.stop();
      if (selection.layerId === null) return;
      const owner = layers.find((l) => l.id === selection.layerId);
      if (!owner) {
        selection.clear();
        return;
      }
      // Features hidden by a filter can't stay selected.
      const keep = filterPredicate(owner.filter, numericFieldsOf(owner.data));
      selection.retain((id) => keep(owner.data.geojson.features[id]?.properties));
    });
  });

  /** Selects one feature, and shows its layer in the attribute table if that's open. */
  function selectFeature(hit: FeatureHit) {
    selection.select(hit.layerId, [hit.featureId], hit.featureId);
    if (tableLayerId !== null) tableLayerId = hit.layerId;
  }

  /** A click on the map: identify what's there, or clear the selection on a miss. */
  function onFeatureClick(hits: FeatureHit[]) {
    // While editing annotations or measuring, clicks belong to those tools.
    if (editor.layerId || measure.active) return;
    identifyHits = hits;
    identifyIndex = 0;
    if (hits.length > 0) selectFeature(hits[0]);
    else selection.clear();
  }

  function zoomToFeatures(layerId: string, ids: number[]) {
    const features = list.layers.find((l) => l.id === layerId)?.data.geojson.features ?? [];
    const bbox = featuresBbox(ids.map((id) => features[id]).filter(Boolean));
    if (bbox) mapView.fitBounds(bbox, 15);
  }

  function openTable(layerId: string) {
    tableLayerId = layerId;
  }

  /** Layer → Attribute Table: closes the table, or opens it for the layer chosen in the layer panel. */
  function toggleTable() {
    tableLayerId = tableLayerId === null ? (list.selected?.id ?? null) : null;
  }

  /** Esc: clears the selection and closes the identify panel. */
  function clearSelection() {
    selection.clear();
    identifyHits = [];
  }

  /**
   * Edit → Select All: selects every feature (that passes the filter) of the
   * layer chosen in the layer panel, or else of the layer with the selection.
   */
  function selectAll(): boolean {
    const layer = list.selected ?? list.layers.find((l) => l.id === selection.layerId);
    if (!layer) return false;
    const keep = filterPredicate(layer.filter, numericFieldsOf(layer.data));
    const ids = layer.data.geojson.features.flatMap((feature, i) => (keep(feature.properties) ? [i] : []));
    selection.select(layer.id, ids);
    message = { text: `Selected ${plural(ids.length, "feature")} in ${layer.name}`, error: false };
    return true;
  }

  /** A search result was picked: select it, go there, and show its attributes. */
  function onSearchPick(hit: SearchHit) {
    const found = { layerId: hit.layerId, featureId: hit.featureId };
    identifyHits = [found];
    identifyIndex = 0;
    selectFeature(found);
    zoomToFeatures(hit.layerId, [hit.featureId]);
  }

  /** Dragging the table's top edge resizes it (pointer capture keeps the drag going). */
  function startTableResize(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement;
    const startY = event.clientY;
    const startHeight = tableHeight;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      tableHeight = Math.round(Math.min(window.innerHeight - 200, Math.max(100, startHeight + startY - e.clientY)));
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
  }

  // --- Annotations ---------------------------------------------------------------

  // Identify isn't used while editing (clicks draw), and its panel would sit under the tools.
  // Editing and measuring both use map clicks, so starting to edit stops measuring.
  $effect(() => {
    if (!editor.layerId) return;
    untrack(() => {
      identifyHits = [];
      if (measure.active) measure.stop();
    });
  });

  /** The Measure button: starts or stops the measure tool (stopping annotation editing first). */
  function toggleMeasure() {
    if (measure.active) {
      measure.stop();
      return;
    }
    editor.stop();
    identifyHits = [];
    measure.start();
  }

  // Keep terra-draw's selection in step with the Selection store (table clicks, undo...).
  $effect(() => {
    void [selection.layerId, selection.ids, editor.tool];
    untrack(() => editor.followSelection());
  });

  /** Adds an empty annotation layer on top and starts editing it. */
  function newAnnotationLayer() {
    const count = list.layers.filter((l) => l.annotations).length;
    const layer = list.addAnnotationLayer(count === 0 ? "Annotations" : `Annotations ${count + 1}`);
    history.push({
      label: `Add ${layer.name}`,
      undo: () => list.remove(layer.id),
      redo: () => list.insert(layer, list.layers.length),
    });
    editor.start(layer.id);
  }

  function toggleEditing(layer: MapLayer) {
    if (editor.layerId === layer.id) editor.stop();
    else editor.start(layer.id);
  }

  /** Removes a layer. Removing an annotation layer can be undone (its drawings would be lost otherwise). */
  function removeLayer(layer: MapLayer) {
    const index = list.layers.findIndex((l) => l.id === layer.id);
    list.remove(layer.id);
    if (layer.annotations) {
      history.push({
        label: `Remove ${layer.name}`,
        undo: () => list.insert(layer, index),
        redo: () => list.remove(layer.id),
      });
      message = { text: `Removed ${layer.name}. Undo (${keys("undo")}) brings it back.`, error: false };
    }
  }

  /** Writes a layer to a GeoPackage or GeoJSON file. */
  async function exportLayerFile(layer: MapLayer) {
    if (!needsDesktop("Exporting")) return;
    const path = await pickExportPath(layer.name);
    if (!path) return;
    // Annotations go out with their properties (including style overrides) and ids.
    const collection = layer.annotations
      ? { type: "FeatureCollection" as const, features: layer.annotations }
      : layer.data.geojson;
    try {
      const count = await exportLayer(path, layer.name, collection);
      message = { text: `Exported ${count.toLocaleString()} features to ${fileName(path)}`, error: false };
    } catch (error) {
      message = { text: errorText(error), error: true };
    }
  }

  /** The selected features' layer and ids (in list order), or null. */
  function selectedFeatures(): { layer: MapLayer; ids: number[] } | null {
    const layer = list.layers.find((l) => l.id === selection.layerId);
    if (!layer || selection.count === 0) return null;
    return { layer, ids: [...selection.ids].sort((a, b) => a - b) };
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  /** Copies the selected features (from any layer) for pasting into an annotation layer. */
  function copySelection(): boolean {
    const chosen = selectedFeatures();
    if (!chosen) return false;
    const { layer, ids } = chosen;
    clipboard = layer.annotations
      ? ids.map((i) => layer.annotations![i])
      : annotationsFromFeatures(
          ids.map((i) => layer.data.geojson.features[i]),
          layer.data.fields,
        );
    // Also put them on the system clipboard as GeoJSON, for pasting into other programs.
    navigator.clipboard?.writeText(JSON.stringify({ type: "FeatureCollection", features: clipboard })).catch(() => {});
    message = { text: `Copied ${plural(clipboard.length, "feature")}`, error: false };
    return true;
  }

  /** Deletes the selected annotations. Returns false if the selection isn't in an annotation layer. */
  function deleteSelection(verb = "Delete"): boolean {
    const chosen = selectedFeatures();
    const features = chosen?.layer.annotations;
    if (!chosen || !features) return false;
    const gone = new Set(chosen.ids.map((i) => features[i].id));
    editor.change(chosen.layer.id, features.filter((f) => !gone.has(f.id)), `${verb} ${plural(gone.size, "annotation")}`);
    selection.clear();
    return true;
  }

  /** Copies and deletes the selected annotations. Returns false if nothing is selected. */
  function cutSelection(): boolean {
    const chosen = selectedFeatures();
    if (!chosen) return false;
    if (!chosen.layer.annotations) {
      message = { text: "Only annotations can be cut. Use Copy for features of data layers.", error: true };
      return true;
    }
    copySelection();
    deleteSelection("Cut");
    return true;
  }

  /**
   * Pastes into the annotation layer being edited, else the one whose style is
   * open, else the top annotation layer, else a new one.
   */
  function paste(): boolean {
    if (clipboard.length === 0) return false;
    let target =
      editingLayer ??
      (list.selected?.annotations ? list.selected : null) ??
      [...list.layers].reverse().find((l) => l.annotations) ??
      null;
    if (!target) {
      newAnnotationLayer();
      target = editingLayer!;
    }
    const existing = target.annotations!;
    editor.change(target.id, [...existing, ...withNewIds(clipboard)], `Paste ${plural(clipboard.length, "annotation")}`);
    selection.select(target.id, clipboard.map((_, k) => existing.length + k));
    message = { text: `Pasted ${plural(clipboard.length, "feature")} into ${target.name}`, error: false };
    return true;
  }

  /** Copies the selected annotations into the same layer, a little down and to the right. */
  function duplicate(): boolean {
    const chosen = selectedFeatures();
    const features = chosen?.layer.annotations;
    if (!chosen || !features) return false;
    const [dx, dy] = mapView.pixelsToDegrees(12);
    const copies = offset(withNewIds(chosen.ids.map((i) => features[i])), dx, dy);
    editor.change(chosen.layer.id, [...features, ...copies], `Duplicate ${plural(copies.length, "annotation")}`);
    selection.select(chosen.layer.id, copies.map((_, k) => features.length + k));
    return true;
  }

  function undo() {
    const label = history.undo();
    message = label ? { text: `Undid: ${label}`, error: false } : null;
  }

  function redo() {
    const label = history.redo();
    message = label ? { text: `Redid: ${label}`, error: false } : null;
  }

  // --- Menus and keyboard shortcuts ------------------------------------------------
  // The commands, their shortcuts and the menu layout are in lib/shell/commands.ts.

  /** The menu bar for the current state (labels, check marks, what's enabled). */
  let template = $derived(
    menuTemplate({
      macLayout: inDesktopApp && isMac,
      desktop: inDesktopApp,
      recent: recent.map(recentLabel),
      undoLabel: history.undoLabel,
      redoLabel: history.redoLabel,
      layer: list.selected ? { name: list.selected.name, annotations: list.selected.annotations !== null } : null,
      editing: editor.layerId !== null && editor.layerId === list.selected?.id,
      tableOpen: tableLayerId !== null,
      hasSelection: selection.count > 0,
      selectionEditable: selection.count > 0 && !!list.layers.find((l) => l.id === selection.layerId)?.annotations,
      globe: doc.globe,
      measuring: measure.active,
      theme: prefs.theme,
    }),
  );

  /** The native menu bar (desktop app only; a browser gets the HTML MenuBar). */
  const nativeMenu = inDesktopApp ? new NativeMenu((id) => onMenuCommand(id)) : null;
  $effect(() => nativeMenu?.update(template));

  /** A command's shortcut for tooltips, e.g. "⌘S" or "Ctrl+S". */
  const keys = (id: CommandId) => shortcutLabel(SHORTCUTS[id]![0], isMac);

  /**
   * Runs a command. Returns false if it had nothing to act on (Copy with
   * nothing selected...), so the key can do its usual job instead.
   */
  function perform(id: CommandId): boolean {
    if (id.startsWith("recent:")) {
      const path = recent[Number(id.slice("recent:".length))];
      if (path) exclusive(() => openRecent(path));
      return true;
    }
    if (id.startsWith("theme:")) {
      prefs.theme = id.slice("theme:".length) as Theme;
      return true;
    }
    const layer = list.selected;
    switch (id) {
      case "new":
        exclusive(newProject);
        break;
      case "open":
        exclusive(openFiles);
        break;
      case "clearRecent":
        recent = [];
        writeRecent(recent);
        break;
      case "save":
        exclusive(save);
        break;
      case "saveAs":
        exclusive(saveAs);
        break;
      case "openOffline":
        exclusive(openOfflineMap);
        break;
      case "quit":
        exclusive(quit);
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "cut":
        return cutSelection();
      case "copy":
        return copySelection();
      case "paste":
        return paste();
      case "selectAll":
        return selectAll();
      case "duplicate":
        return duplicate();
      case "delete":
        return deleteSelection();
      case "clearSelection":
        clearSelection();
        break;
      case "zoomFull":
        zoomToAll();
        break;
      case "zoomIn":
        mapView.zoomBy(1);
        break;
      case "zoomOut":
        mapView.zoomBy(-1);
        break;
      case "globe":
        doc.globe = !doc.globe;
        break;
      case "newAnnotationLayer":
        newAnnotationLayer();
        break;
      case "zoomLayer":
        if (layer) zoomToLayer(layer);
        break;
      case "table":
        toggleTable();
        break;
      case "editAnnotations":
        if (layer?.annotations) toggleEditing(layer);
        break;
      case "exportLayer":
        if (layer) exclusive(() => exportLayerFile(layer));
        break;
      case "removeLayer":
        if (layer) removeLayer(layer);
        break;
      case "measure":
        toggleMeasure();
        break;
      case "find":
        searchBox.focus();
        break;
      case "preferences":
      case "shortcuts":
      case "offlineHelp":
      case "about":
        dialog = id;
        break;
    }
    return true;
  }

  /**
   * The last command run, from where, and when. A shortcut may reach us twice,
   * once as a key press and once from the menu (which comes first, and whether
   * both come, differs between operating systems), so a repeat from the other
   * source straight away is ignored.
   */
  let lastRun = { id: "", source: "", at: 0 };

  function run(id: CommandId, source: "key" | "menu"): boolean {
    const now = performance.now();
    if (id === lastRun.id && source !== lastRun.source && now - lastRun.at < 400) return true;
    const handled = perform(id);
    if (handled) lastRun = { id, source, at: now };
    return handled;
  }

  /** A menu item was chosen (native menu, or the HTML menu bar in a browser). */
  function onMenuCommand(id: CommandId) {
    const field = document.activeElement as HTMLElement | null;
    if (field && isTextEntry(field) && TEXT_EDITING.has(id)) {
      // While typing, Undo and Select All are about the text. On macOS and
      // Linux these keys reach the menu instead of the text box (on Windows
      // only menu clicks come here), so do the text box's job for it.
      if (id === "selectAll" && (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) field.select();
      else if (id === "undo" || id === "redo") document.execCommand(id);
      return;
    }
    run(id, "menu");
  }

  /** True if some text on the page is selected (Copy should copy that, not features). */
  const textSelected = () => !(window.getSelection()?.isCollapsed ?? true);

  /**
   * Keyboard shortcuts (Cmd on macOS, Ctrl elsewhere; see SHORTCUTS in
   * commands.ts), plus Delete/Backspace and Esc. Editing keys are left to text
   * boxes while typing.
   */
  function onKeydown(event: KeyboardEvent) {
    const typing = isTextEntry(event.target as HTMLElement);
    // While measuring: Enter finishes, Backspace removes the last point, Esc clears (and again stops).
    if (measure.active && !typing && ["Enter", "Backspace", "Delete", "Escape"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "Enter") measure.finish();
      else if (event.key === "Escape") {
        if (measure.points.length > 0) measure.clear();
        else measure.stop();
      } else measure.undoPoint();
      return;
    }
    // A dialog box handles its own keys (Esc closes it).
    if (dialog) return;
    const id = commandForKey(event, isMac, typing);
    if (!id) return;
    if ((id === "copy" || id === "cut") && textSelected()) return;
    if (run(id, "key")) event.preventDefault();
  }

  /**
   * Cut/Copy/Paste chosen from the macOS Edit menu with the mouse arrive as
   * these clipboard events rather than as commands (the menu items are the
   * OS's own, so they work in text boxes). Outside text boxes they act on features.
   */
  function onClipboardEvent(event: ClipboardEvent, id: "cut" | "copy" | "paste") {
    if (dialog || isTextEntry(document.activeElement as HTMLElement) || (id !== "paste" && textSelected())) return;
    if (run(id, "menu")) event.preventDefault();
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  ondragover={(e) => {
    // In a plain browser, stop a dropped file from replacing the page. (The
    // desktop app gets dropped files through onFileDrag instead.)
    if (!inDesktopApp) e.preventDefault();
  }}
  ondrop={(e) => {
    if (inDesktopApp) return;
    e.preventDefault();
    message = { text: "Dropping files needs the desktop app (npm run app:dev).", error: true };
  }}
/>
<svelte:document
  oncut={(e) => onClipboardEvent(e, "cut")}
  oncopy={(e) => onClipboardEvent(e, "copy")}
  onpaste={(e) => onClipboardEvent(e, "paste")}
/>

<div class="shell">
  <div class="top">
    {#if !inDesktopApp}
      <MenuBar {template} mac={isMac} onCommand={onMenuCommand} />
    {/if}
    <header class="toolbar">
      <strong class="brand">SmartMap</strong>
      <div class="group" role="group" aria-label="Project">
        <button onclick={() => exclusive(newProject)} disabled={busy} title="New project ({keys('new')})">New</button>
        <button onclick={() => exclusive(openFiles)} disabled={busy} title="Open a project or add data files ({keys('open')})">
          Open…
        </button>
        <button onclick={() => exclusive(save)} disabled={busy} title="Save the project ({keys('save')})">Save</button>
        <button onclick={() => exclusive(saveAs)} disabled={busy} title="Save the project as a new file ({keys('saveAs')})">
          Save As…
        </button>
      </div>
      <BasemapPicker
        {doc}
        disabled={busy}
        onOpenOffline={() => exclusive(openOfflineMap)}
        onHelp={() => (dialog = "offlineHelp")}
      />
      <label><input type="checkbox" bind:checked={doc.globe} /> Globe</label>
      <button
        class:on={measure.active}
        aria-pressed={measure.active}
        onclick={toggleMeasure}
        title="Measure distances and areas ({keys('measure')})">📏 Measure</button
      >
      {#if busy}<span class="muted">Working…</span>{/if}
      <span class="spacer"></span>
      <SearchBox bind:this={searchBox} layers={list.layers} onPick={onSearchPick} />
    </header>
  </div>

  <main>
    <aside class="sidebar">
      <LayerPanel
        {list}
        onZoom={zoomToLayer}
        onTable={(layer) => openTable(layer.id)}
        onExport={(layer) => exclusive(() => exportLayerFile(layer))}
        onNewAnnotationLayer={newAnnotationLayer}
        onToggleEdit={toggleEditing}
        onRemove={removeLayer}
        editingId={editor.layerId}
      />
      <MissingLayers {doc} />
      {#if selectedAnnotation}
        <AnnotationProperties {editor} layer={selectedAnnotation.layer} feature={selectedAnnotation.feature} />
      {/if}
      {#if list.selected}
        <StyleEditor {list} layer={list.selected} />
        <FilterEditor {list} layer={list.selected} />
        <StatsPanel layer={list.selected} {selection} />
      {/if}
    </aside>
    <div class="center">
      <div class="map-area">
        <MapView
          bind:this={mapView}
          {basemap}
          globe={doc.globe}
          layers={list.layers}
          {selection}
          noHighlightLayerId={editor.layerId}
          cursorMode={editor.layerId ? "off" : measure.active ? "crosshair" : "features"}
          {onFeatureClick}
          onMapReady={(map) => {
            editor.attach(map);
            measure.attach(map);
          }}
          onStyleLoad={() => editor.restartAfterStyleChange()}
          onCursor={(c) => (cursor = c)}
          onZoom={(z) => (zoom = z)}
          units={prefs.units}
        />
        {#if measure.active}
          <MeasurePanel tool={measure} bind:units={prefs.units} />
        {/if}
        {#if editingLayer}
          <AnnotationToolbar {editor} {history} layerName={editingLayer.name} onUndo={undo} onRedo={redo} />
        {/if}
        <IdentifyPanel
          hits={identifyHits}
          current={identifyIndex}
          layers={list.layers}
          onPick={(index) => {
            identifyIndex = index;
            selectFeature(identifyHits[index]);
          }}
          onZoom={(hit) => zoomToFeatures(hit.layerId, [hit.featureId])}
          onShowInTable={(hit) => {
            openTable(hit.layerId);
            selectFeature(hit);
          }}
          onClose={() => (identifyHits = [])}
          measure={measureGeometry}
          units={prefs.units}
          coordFormat={prefs.coordFormat}
        />
      </div>
      {#if tableLayer}
        <div class="table-area" style:height="{tableHeight}px">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="resize" title="Drag to resize" onpointerdown={startTableResize}></div>
          <!-- A new layer gets a fresh table (sort and searches reset). -->
          {#key tableLayer.id}
            <AttributeTable
              layer={tableLayer}
              layers={list.layers}
              {selection}
              onPickLayer={openTable}
              onZoomTo={zoomToFeatures}
              onClose={() => (tableLayerId = null)}
            />
          {/key}
        </div>
      {/if}
    </div>
  </main>
  <footer class="statusbar">
    <button
      class="coords"
      title="Click to switch between decimal degrees and DMS"
      onclick={() => (prefs.coordFormat = prefs.coordFormat === "decimal" ? "dms" : "decimal")}
    >
      {cursorText}
    </button>
    <span>Zoom {zoom.toFixed(2)}</span>
    {#if message}
      <span class="message" class:error={message.error} title={message.text}>{message.text}</span>
    {/if}
    <span class="spacer"></span>
    {#if info}
      <span class="muted">{info.name} {info.version} · {info.os}/{info.arch}</span>
    {/if}
  </footer>
</div>

{#if dragging}
  <div class="drop" aria-hidden="true">
    <div>Drop projects, data files or offline maps to open them</div>
  </div>
{/if}

{#if dialog === "about"}
  <AboutDialog {info} onClose={() => (dialog = null)} />
{:else if dialog === "preferences"}
  <PreferencesDialog {prefs} onClose={() => (dialog = null)} />
{:else if dialog === "shortcuts"}
  <ShortcutsDialog {template} mac={isMac} onClose={() => (dialog = null)} />
{:else if dialog === "offlineHelp"}
  <OfflineHelp onClose={() => (dialog = null)} />
{/if}

<style>
  .shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }
  /* Shown while files are dragged over the window. */
  .drop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 3px dashed var(--accent);
    pointer-events: none;
  }
  .drop div {
    padding: 12px 18px;
    border-radius: 8px;
    background: var(--bg);
    font-size: 15px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
  }
  .toolbar,
  .statusbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 12px;
    background: var(--panel);
    border-color: var(--border);
    border-style: solid;
    border-width: 0;
    min-width: 0;
  }
  .toolbar {
    border-bottom-width: 1px;
    /* At narrow window widths the controls continue on a second row. */
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .toolbar label,
  .toolbar button {
    white-space: nowrap;
  }
  .statusbar {
    border-top-width: 1px;
    font-variant-numeric: tabular-nums;
  }
  .brand {
    color: var(--accent);
  }
  .toolbar button.on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: var(--accent);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .map-area {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .table-area {
    position: relative;
    flex: none;
    border-top: 1px solid var(--border);
    min-height: 0;
  }
  .resize {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    z-index: 3;
    touch-action: none;
  }
  main {
    display: grid;
    grid-template-columns: 290px 1fr;
    min-height: 0;
  }
  .sidebar {
    background: var(--bg);
    border-right: 1px solid var(--border);
    padding: 10px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .coords {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .coords {
    min-width: 260px;
    text-align: left;
  }
  .message {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .message.error {
    color: #cf222e;
  }
  .spacer {
    flex: 1;
  }
  .muted {
    color: var(--muted);
    white-space: nowrap;
  }
  input,
  .toolbar button {
    font: inherit;
  }
</style>
