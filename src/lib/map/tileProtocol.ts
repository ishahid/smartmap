/**
 * Answers MapLibre's requests for `smartmap-tiles://<id>/<z>/<x>/<y>` by
 * fetching the tile from Rust (fetchTile in api.ts).
 *
 * Why not give MapLibre the tiles:// address directly? MapLibre loads tiles
 * inside a web worker, and not every platform's web view sends a worker's
 * requests for custom schemes to the app. A protocol registered with
 * `addProtocol` runs on the page itself, where tiles:// always works. It also
 * keeps styles the same everywhere (Windows uses http://tiles.localhost instead).
 *
 * Importing this file registers the protocol; MapView does that.
 */
import { fetchTile } from "../api";
import { addProtocol } from "./maplibre";
import { TILE_PROTOCOL } from "./offline";

const ADDRESS = new RegExp(`^${TILE_PROTOCOL}://([^/]+)/(\\d+)/(\\d+)/(\\d+)`);

addProtocol(TILE_PROTOCOL, async (request, abortController) => {
  const match = ADDRESS.exec(request.url);
  if (!match) throw new Error(`Not an offline tile address: ${request.url}`);
  const [, id, z, x, y] = match;
  const data = await fetchTile(id, Number(z), Number(x), Number(y), abortController.signal);
  // An empty answer means "no tile here"; MapLibre leaves that spot blank.
  return { data: data ?? new ArrayBuffer(0) };
});
