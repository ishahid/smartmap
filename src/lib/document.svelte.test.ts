import { describe, expect, it } from "vitest";
import type { LayerData, Project, TileInfo } from "./api";
import { MapDocument } from "./document.svelte";

const data = (path: string, table: string | null = null): LayerData => ({
  name: table ?? path.split("/").pop()!,
  path,
  table,
  format: table ? "GeoPackage" : "Shapefile",
  geometryType: "Point",
  featureCount: 0,
  emptyGeometries: 0,
  bbox: null,
  fields: [],
  crs: "EPSG:4326",
  reprojected: false,
  warnings: [],
  geojson: { type: "FeatureCollection", features: [] },
});

/** A pretend `openTiles` that knows one offline map file. */
const tileInfo = (path: string): TileInfo => ({
  id: "t1",
  path,
  name: "Italy",
  format: "PMTiles",
  tileType: "vector",
  minZoom: 0,
  maxZoom: 14,
  bounds: [6, 36, 19, 47],
  center: null,
  attribution: null,
  version: null,
  vectorLayers: ["earth", "water", "roads"],
});
const openTiles = async (path: string) => {
  if (path !== "/maps/italy.pmtiles") throw new Error(`could not open ${path}`);
  return tileInfo(path);
};

const view = { center: [73, 33] as [number, number], zoom: 5, bearing: 0, pitch: 0 };

/** A pretend `openFile` that knows a few files, and counts how often each is read. */
function fakeFiles() {
  const reads: string[] = [];
  const files: Record<string, LayerData[]> = {
    "/maps/world.shp": [data("/maps/world.shp")],
    "/maps/city.gpkg": [data("/maps/city.gpkg", "roads"), data("/maps/city.gpkg", "parks")],
  };
  const open = async (path: string) => {
    reads.push(path);
    if (!files[path]) throw new Error(`could not read ${path}: not found`);
    return files[path];
  };
  return { open, reads };
}

describe("MapDocument", () => {
  it("starts clean and untitled, and gets dirty on changes", () => {
    const doc = new MapDocument();
    expect(doc.dirty).toBe(false);
    expect(doc.name).toBe("Untitled");

    const layer = doc.layers.add(data("/maps/world.shp"));
    expect(doc.dirty).toBe(true);
    doc.markSaved("/maps/trip.smartmap");
    expect(doc.dirty).toBe(false);
    expect(doc.name).toBe("trip");

    doc.layers.updateStyle(layer.id, { lineWidth: 9 });
    expect(doc.dirty).toBe(true);
    doc.layers.updateStyle(layer.id, { lineWidth: layer.style.lineWidth });
    expect(doc.dirty).toBe(false); // changed back by hand

    doc.globe = true;
    expect(doc.dirty).toBe(true);
  });

  it("round-trips through a project", async () => {
    const { open } = fakeFiles();
    const doc = new MapDocument();
    const [world] = await open("/maps/world.shp");
    const [roads, parks] = await open("/maps/city.gpkg");
    doc.layers.add(world);
    const p = doc.layers.add(parks, { name: "Parks", opacity: 0.4 });
    doc.layers.add(roads, { visible: false });
    doc.layers.updateStyle(p.id, { kind: "categorized", field: "TYPE" });
    doc.layers.update(p.id, { filter: { match: "any", conditions: [{ field: "TYPE", operator: "=", value: "park" }] } });
    doc.basemapId = "bright";
    const project = doc.toProject(view);

    const reopened = new MapDocument();
    expect(await reopened.load(structuredClone(project), "/maps/trip.smartmap", open, openTiles)).toEqual([]);
    expect(reopened.toProject(view)).toEqual(project);
    expect(reopened.layers.layers.map((l) => l.data.table)).toEqual([null, "parks", "roads"]);
    expect(reopened.dirty).toBe(false);
    expect(reopened.path).toBe("/maps/trip.smartmap");
  });

  it("reads each file once and keeps layers it can't open", async () => {
    const { open, reads } = fakeFiles();
    const project: Project = {
      view,
      basemap: "no-longer-exists",
      globe: true,
      layers: [
        { path: "/maps/city.gpkg", table: "roads", name: "r", visible: true, opacity: 1, style: null, filter: null },
        { path: "/gone.shp", table: null, name: "gone", visible: true, opacity: 1, style: null, filter: null },
        { path: "/maps/city.gpkg", table: "parks", name: "p", visible: true, opacity: 1, style: null, filter: null },
        { path: "/maps/city.gpkg", table: "lakes", name: "l", visible: true, opacity: 1, style: null, filter: null },
      ],
    };
    const doc = new MapDocument();
    const problems = await doc.load(project, "/maps/t.smartmap", open, openTiles);

    expect(reads).toEqual(["/maps/city.gpkg", "/gone.shp"]);
    expect(doc.layers.layers.map((l) => l.name)).toEqual(["r", "p"]);
    expect(problems.map((p) => p.reason)).toEqual([
      "could not read /gone.shp: not found",
      'city.gpkg has no table "lakes"',
    ]);
    expect(doc.basemapId).toBe("liberty");
    expect(doc.globe).toBe(true);
    expect(doc.dirty).toBe(false);

    // Missing layers are saved back (at the bottom) until the user forgets them.
    expect(doc.toProject(view).layers.map((l) => l.name)).toEqual(["gone", "l", "r", "p"]);
    doc.forgetMissing(doc.missing[0]);
    expect(doc.dirty).toBe(true);
    expect(doc.missing.map((l) => l.name)).toEqual(["l"]);
  });

  it("saves the offline map and opens it again", async () => {
    const { open } = fakeFiles();
    const doc = new MapDocument();
    doc.useOfflineMap(tileInfo("/maps/italy.pmtiles"));
    expect(doc.basemapId).toBe("offline");
    expect(doc.dirty).toBe(true);
    doc.setFlavor("dark");
    const project = doc.toProject(view);
    expect(project.offlineMap).toEqual({ path: "/maps/italy.pmtiles", flavor: "dark" });

    const reopened = new MapDocument();
    await reopened.load(structuredClone(project), "/maps/trip.smartmap", open, openTiles);
    expect(reopened.basemapId).toBe("offline");
    expect(reopened.offlineInfo?.name).toBe("Italy");
    expect(reopened.offlineProblem).toBeNull();
    expect(reopened.dirty).toBe(false);

    // A different basemap can be chosen while keeping the file for later.
    reopened.basemapId = "positron";
    expect(reopened.toProject(view).offlineMap?.path).toBe("/maps/italy.pmtiles");
  });

  it("keeps an offline map it can't open, and says why", async () => {
    const { open } = fakeFiles();
    const project: Project = {
      view,
      basemap: "offline",
      offlineMap: { path: "/usb/gone.pmtiles", flavor: "not-a-flavor" },
      globe: false,
      layers: [],
    };
    const doc = new MapDocument();
    await doc.load(project, "/maps/t.smartmap", open, openTiles);
    expect(doc.offlineInfo).toBeNull();
    expect(doc.offlineProblem).toBe("could not open /usb/gone.pmtiles");
    expect(doc.basemapId).toBe("offline");
    // Saved back unchanged, apart from the unknown colour scheme.
    expect(doc.toProject(view).offlineMap).toEqual({ path: "/usb/gone.pmtiles", flavor: "light" });

    // "offline" without a file is treated like any unknown basemap id.
    await doc.load({ ...project, offlineMap: null }, "/maps/t.smartmap", open, openTiles);
    expect(doc.basemapId).toBe("liberty");
  });

  it("reset() gives an empty untitled project", () => {
    const doc = new MapDocument();
    doc.layers.add(data("/maps/world.shp"));
    doc.globe = true;
    doc.markSaved("/maps/trip.smartmap");
    doc.reset();
    expect(doc.layers.layers).toEqual([]);
    expect(doc.globe).toBe(false);
    expect(doc.path).toBeNull();
    expect(doc.dirty).toBe(false);
  });

  it("starts new projects with the preferred basemap, unchanged", () => {
    const doc = new MapDocument("positron");
    expect(doc.basemapId).toBe("positron");
    expect(doc.dirty).toBe(false);
    doc.basemapId = "bright";
    doc.reset("none");
    expect(doc.basemapId).toBe("none");
    expect(doc.dirty).toBe(false);
  });

  it("saves annotation layers inside the project and restores them", async () => {
    const { open, reads } = fakeFiles();
    const doc = new MapDocument();
    const [world] = await open("/maps/world.shp");
    doc.layers.add(world);
    const notes = doc.layers.addAnnotationLayer("Notes", [], { opacity: 0.5 });
    doc.layers.setAnnotations(notes.id, [
      {
        type: "Feature",
        id: "11111111-2222-4333-8444-555555555555",
        geometry: { type: "Point", coordinates: [73, 33] },
        properties: { kind: "text", name: "", description: "", text: "Home", size: 20 },
      },
    ]);
    const project = doc.toProject(view);
    expect(project.layers[1]).toMatchObject({ path: "", name: "Notes", annotation: { type: "FeatureCollection" } });
    expect(project.layers[0].annotation).toBeUndefined();

    reads.length = 0;
    const reopened = new MapDocument();
    expect(await reopened.load(structuredClone(project), "/maps/trip.smartmap", open, openTiles)).toEqual([]);
    expect(reads).toEqual(["/maps/world.shp"]); // nothing read for the annotation layer
    expect(reopened.toProject(view)).toEqual(project);
    expect(reopened.layers.layers[1].annotations?.[0].properties.text).toBe("Home");
  });
});
