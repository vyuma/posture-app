type Layer = { ind: number; tt?: number; td?: number; tp?: number };
type Composition = { layers: Layer[]; assets?: { layers?: Layer[] }[] };

/** SVG uses array adjacency for implicit mattes; Canvas uses ind - 1.
 * Our generated silhouette is adjacent but was assigned its index later.
 * Bind the existing silhouette explicitly without changing any motion data.
 */
export function bindCanvasMattes<T extends Composition>(animation: T): T {
  function bind(layers: Layer[]) {
    layers.forEach((layer, index) => {
      const previous = layers[index - 1];
      if (layer.tt && layer.tp == null && previous?.td === 1) layer.tp = previous.ind;
    });
  }
  bind(animation.layers);
  animation.assets?.forEach(asset => { if (asset.layers) bind(asset.layers); });
  return animation;
}
