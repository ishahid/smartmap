import type { LayerData } from "../api";

/** A data layer as the UI tracks it: what Rust loaded, plus display settings. */
export interface MapLayer {
  /** Unique id for this session, used to name MapLibre sources and layers. */
  id: string;
  data: LayerData;
  color: string;
}
