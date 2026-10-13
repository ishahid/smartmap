import type { LayerData } from "../api";
import type { LayerStyle } from "../style/types";

/** A data layer as the UI tracks it: what Rust loaded, plus how to show it. */
export interface MapLayer {
  /** Unique id for this session, used to name MapLibre sources and layers. */
  id: string;
  /** What Rust loaded. Never changed after loading. */
  data: LayerData;
  /** Display name; starts as the file name and can be renamed. */
  name: string;
  visible: boolean;
  /** 0–1, applied on top of the style's own opacities. */
  opacity: number;
  style: LayerStyle;
}
