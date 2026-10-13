import { describe, expect, it } from "vitest";
import { MAX_RECENT, withRecent, withoutRecent } from "./recent";

describe("recent projects", () => {
  it("moves a reopened project to the front without duplicates", () => {
    expect(withRecent(["/a", "/b", "/c"], "/c")).toEqual(["/c", "/a", "/b"]);
    expect(withRecent([], "/a")).toEqual(["/a"]);
  });

  it("keeps at most MAX_RECENT entries", () => {
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `/p${i}`);
    const list = withRecent(many, "/new");
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe("/new");
    expect(list).not.toContain(`/p${MAX_RECENT - 1}`);
  });

  it("removes a project", () => {
    expect(withoutRecent(["/a", "/b"], "/a")).toEqual(["/b"]);
  });
});
