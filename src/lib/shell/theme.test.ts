import { describe, expect, it } from "vitest";
import { applyTheme, isTheme } from "./theme";

describe("theme", () => {
  it("sets <html data-theme> for light and dark, and removes it to follow the OS", () => {
    const root = { dataset: {} as Record<string, string> } as HTMLElement;
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    applyTheme("light", root);
    expect(root.dataset.theme).toBe("light");
    applyTheme("system", root);
    expect(root.dataset.theme).toBeUndefined();
  });

  it("knows the theme names", () => {
    expect(isTheme("system")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
  });
});
