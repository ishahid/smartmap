import type { LayerData } from "../api";
import type { AnnotationFeature } from "../annotate/types";
import type { LayerFilter } from "../filter";
import type { LayerStyle } from "../style/types";

/** A data layer as the UI tracks it: what Rust loaded, plus how to show it. */
export interface MapLayer {
  /** Unique id for this session, used to name MapLibre sources and layers. */
  id: string;
  /** What Rust loaded (never changed), or for annotation layers, built from `annotations`. */
  data: LayerData;
  /** Display name; starts as the file name and can be renamed. */
  name: string;
  visible: boolean;
  /** 0–1, applied on top of the style's own opacities. */
  opacity: number;
  style: LayerStyle;
  /** Show only features matching this, or null for all (see lib/filter.ts). */
  filter: LayerFilter | null;
  /**
   * For annotation layers, the drawn features (with stable ids); `data` is
   * rebuilt from them after every edit. Null for data layers read from files.
   */
  annotations: AnnotationFeature[] | null;
}

/** A feature found on the map (clicked, searched for): which layer, and its id there. */
export interface FeatureHit {
  layerId: string;
  /** The feature's position in the layer's feature list. */
  featureId: number;
}
