import { describe, expect, it } from "vitest";
import { planUpdate } from "./layerDiff";
import { defaultStyle, styleLayersFor, type StyledLayer } from "../style/layerStyle";

const base: StyledLayer = { id: "1", style: defaultStyle(0), opacity: 1, visible: true };

describe("planUpdate", () => {
  it("changes only the paint properties that differ", () => {
    const plan = planUpdate(styleLayersFor(base), styleLayersFor({ ...base, style: { ...base.style, lineWidth: 4 } }));
    expect(plan).toEqual({
      rebuild: false,
      changes: [{ kind: "paint", layerId: "sm-1-line", property: "line-width", value: 4 }],
    });
  });

  it("does nothing when nothing changed", () => {
    expect(planUpdate(styleLayersFor(base), styleLayersFor(base))).toEqual({ rebuild: false, changes: [] });
  });

  it("updates layout for visibility", () => {
    const plan = planUpdate(styleLayersFor(base), styleLayersFor({ ...base, visible: false }));
    expect(plan.rebuild).toBe(false);
    if (!plan.rebuild) expect(plan.changes.every((c) => c.kind === "layout" && c.property === "visibility")).toBe(true);
  });

  it("rebuilds when layers are added or change type", () => {
    const labelled = { ...base, style: { ...base.style, label: { field: "name", size: 12, color: "#000000" } } };
    expect(planUpdate(styleLayersFor(base), styleLayersFor(labelled))).toEqual({ rebuild: true });
    const star = { ...base, style: { ...base.style, pointShape: "star" as const } };
    expect(planUpdate(styleLayersFor(base), styleLayersFor(star))).toEqual({ rebuild: true });
  });
});
