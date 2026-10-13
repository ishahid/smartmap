<script lang="ts">
  import { onMount, untrack } from "svelte";
  import MapView from "./lib/map/MapView.svelte";
  import { BASEMAPS } from "./lib/map/basemaps";
  import type { FeatureHit, MapLayer } from "./lib/map/types";
  import { MapDocument } from "./lib/document.svelte";
  import { featuresBbox, numericFieldsOf } from "./lib/features";
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
  import { formatLngLat, type CoordFormat } from "./lib/util/coords";
  import { describeLayer } from "./lib/util/layerSummary";
  import { basemapOrDefault, fileName, isProjectFile, projectName, UNTITLED, withProjectExtension } from "./lib/project";
  import { readRecent, withoutRecent, withRecent, writeRecent } from "./lib/recent";
  import {
    askToSaveChanges,
    exportLayer,
    getAppInfo,
    inDesktopApp,
    loadProject,
    measureGeometry,
    onWindowClose,
    openFile,
    pickExportPath,
    pickFilesToOpen,
    pickProjectSavePath,
    PROJECT_EXTENSION,
    saveProject,
    setWindowTitle,
    type AppInfo,
    type LayerData,
  } from "./lib/api";

  /** The open project: layers, basemap, globe, file path, unsaved changes (lib/document.svelte.ts). */
  const doc = new MapDocument();
  const list = doc.layers;
  let basemap = $derived(basemapOrDefault(doc.basemapId));
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

  let coordFormat = $state<CoordFormat>("decimal");
  let cursor = $state<{ lng: number; lat: number } | null>(null);
  let zoom = $state(0);
  let info = $state<AppInfo | null>(null);
  /** Recently opened or saved projects, newest first. */
  let recent = $state(readRecent());
  /** True while opening or saving, to ignore clicks until it's done. */
  let busy = $state(false);
  /** The latest status-bar message, and whether it's an error. */
  let message = $state<{ text: string; error: boolean } | null>(null);

  let mapView: MapView;

  let cursorText = $derived(cursor ? formatLngLat(cursor.lng, cursor.lat, coordFormat) : "—");

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
    return () => void listening.then((stop) => stop());
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
    doc.reset();
    message = null;
  }

  /** File → Open: projects replace the current one, data files are added as layers. */
  async function openFiles() {
    if (!needsDesktop("Opening files")) return;
    const paths = await pickFilesToOpen();
    const projectPath = paths.find(isProjectFile);
    const dataPaths = paths.filter((p) => !isProjectFile(p));
    if (projectPath && (await openProject(projectPath)) !== "opened") return;
    if (dataPaths.length > 0) await addDataFiles(dataPaths);
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
      const problems = await doc.load(project, path, openFile);
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
      return "opened";
    } catch (error) {
      message = { text: errorText(error), error: true };
      return "failed";
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
      message = { text: `Removed ${layer.name}. Undo (Ctrl/Cmd+Z) brings it back.`, error: false };
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

  function cutSelection() {
    if (!selectedFeatures()?.layer.annotations) {
      message = { text: "Only annotations can be cut. Use Copy for features of data layers.", error: true };
      return;
    }
    copySelection();
    deleteSelection("Cut");
  }

  /**
   * Pastes into the annotation layer being edited, else the one whose style is
   * open, else the top annotation layer, else a new one.
   */
  function paste() {
    if (clipboard.length === 0) return;
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
  }

  /** Copies the selected annotations into the same layer, a little down and to the right. */
  function duplicate() {
    const chosen = selectedFeatures();
    const features = chosen?.layer.annotations;
    if (!chosen || !features) return;
    const [dx, dy] = mapView.pixelsToDegrees(12);
    const copies = offset(withNewIds(chosen.ids.map((i) => features[i])), dx, dy);
    editor.change(chosen.layer.id, [...features, ...copies], `Duplicate ${plural(copies.length, "annotation")}`);
    selection.select(chosen.layer.id, copies.map((_, k) => features.length + k));
  }

  function undo() {
    const label = history.undo();
    message = label ? { text: `Undid: ${label}`, error: false } : null;
  }

  function redo() {
    const label = history.redo();
    message = label ? { text: `Redid: ${label}`, error: false } : null;
  }

  /** "trip — maps": the project name and its folder, to tell same-named projects apart. */
  function recentLabel(path: string): string {
    const folder = fileName(path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))));
    return folder ? `${projectName(path)} — ${folder}` : projectName(path);
  }

  /**
   * Desktop-style shortcuts (Ctrl on Windows/Linux, Cmd on macOS):
   * N, O, S, Shift+S for files; Z, Shift+Z (or Y), C, X, V, D for editing;
   * Delete/Backspace deletes selected annotations; Esc clears the selection.
   * Editing keys are left alone while typing in a text box.
   */
  function onKeydown(event: KeyboardEvent) {
    const target = event.target;
    const typing =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
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
    if (event.key === "Escape" && !typing) {
      selection.clear();
      identifyHits = [];
      return;
    }
    if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
      if (deleteSelection()) event.preventDefault();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!typing) {
      const edit =
        key === "z"
          ? event.shiftKey
            ? redo
            : undo
          : key === "y"
            ? redo
            : key === "c"
              ? copySelection
              : key === "x"
                ? cutSelection
                : key === "v"
                  ? paste
                  : key === "d"
                    ? duplicate
                    : null;
      if (edit) {
        event.preventDefault();
        edit();
        return;
      }
    }
    const action =
      key === "n" ? newProject : key === "o" ? openFiles : key === "s" ? (event.shiftKey ? saveAs : save) : null;
    if (!action) return;
    event.preventDefault();
    exclusive(action);
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header class="toolbar">
    <strong class="brand">SmartMap</strong>
    <div class="group" role="group" aria-label="Project">
      <button onclick={() => exclusive(newProject)} disabled={busy} title="New project (Ctrl/Cmd+N)">New</button>
      <button onclick={() => exclusive(openFiles)} disabled={busy} title="Open a project or add data files (Ctrl/Cmd+O)">
        Open…
      </button>
      <button onclick={() => exclusive(save)} disabled={busy} title="Save the project (Ctrl/Cmd+S)">Save</button>
      <button onclick={() => exclusive(saveAs)} disabled={busy} title="Save the project as a new file (Ctrl/Cmd+Shift+S)">
        Save As…
      </button>
      <select
        aria-label="Open a recent project"
        title="Open a recent project"
        disabled={busy || recent.length === 0}
        value=""
        onchange={(e) => {
          const path = e.currentTarget.value;
          e.currentTarget.value = "";
          if (path) exclusive(() => openRecent(path));
        }}
      >
        <option value="">Recent…</option>
        {#each recent as path (path)}
          <option value={path}>{recentLabel(path)}</option>
        {/each}
      </select>
    </div>
    <label>
      Basemap
      <select bind:value={doc.basemapId}>
        {#each BASEMAPS as b (b.id)}
          <option value={b.id}>{b.label}</option>
        {/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={doc.globe} /> Globe</label>
    <button class:on={measure.active} aria-pressed={measure.active} onclick={toggleMeasure} title="Measure distances and areas"
      >📏 Measure</button
    >
    {#if busy}<span class="muted">Working…</span>{/if}
    <span class="spacer"></span>
    <SearchBox layers={list.layers} onPick={onSearchPick} />
  </header>

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
        />
        {#if measure.active}
          <MeasurePanel tool={measure} />
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
          units={measure.units}
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
      onclick={() => (coordFormat = coordFormat === "decimal" ? "dms" : "decimal")}
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

<style>
  .shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
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
  select,
  input,
  .toolbar button {
    font: inherit;
  }
</style>
