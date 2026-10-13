import { describe, expect, it } from "vitest";
import type { LayerData, Project } from "./api";
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
    expect(await reopened.load(structuredClone(project), "/maps/trip.smartmap", open)).toEqual([]);
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
    const problems = await doc.load(project, "/maps/t.smartmap", open);

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
    expect(await reopened.load(structuredClone(project), "/maps/trip.smartmap", open)).toEqual([]);
    expect(reads).toEqual(["/maps/world.shp"]); // nothing read for the annotation layer
    expect(reopened.toProject(view)).toEqual(project);
    expect(reopened.layers.layers[1].annotations?.[0].properties.text).toBe("Home");
  });
});
