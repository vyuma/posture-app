import { POSES, SOURCE_MANIFEST, HEIGHT, readSource, bodyPath, cubicPath, splitCubic, toLottie, bands, color, strokeWidth, svgPoint, path, transformPath } from "./anago-svg-source.mjs";

// Keep the previous poses for old motion studies. Product states now use the
// two designer SVGs supplied on 2026-10-27, without rewriting those originals.
const sources = Object.fromEntries(["rest", "angry"].map(name => [name, readSource(name)]));
const body = name => sources[name].elements.find(e => e.tag === "path" && ["#f78000", "#f70000"].includes(e.style.stroke));
const transforms = Object.fromEntries(Object.keys(sources).map(name => {
  const scale = 226 / strokeWidth(body(name));
  const spine = cubicPath(body(name).attrs.d);
  return [name, { scale, offset: [390 - spine[0][0][0] * scale,
    name === "rest" ? HEIGHT - sources[name].viewBox[3] * scale : 182 - spine.at(-1)[3][1] * scale] }];
}));

function base(source) {
  return { ...structuredClone(source), bodyColor: color("#f78000"), eyeRotations: [0, 0] };
}
function imported(name) {
  const pose = base(POSES.good), source = sources[name], transform = transforms[name];
  const { scale, offset } = transform;
  const point = p => p.map((v, i) => v * scale + offset[i]);
  pose.bodyColor = color(body(name).style.stroke);
  if (name === "rest") {
    // The new resting spine is one cubic, split exactly into four compatible
    // segments. Its droop, handles and silhouette remain designer-authored.
    pose.body = transformPath(toLottie(splitCubic(cubicPath(body(name).attrs.d)[0]).flatMap(s => splitCubic(s))), scale, offset);
  } else pose.body = bodyPath(body(name), scale, offset);
  pose.stripes = bands(source, transform);
  while (pose.stripes.length < 5) pose.stripes.push({
    path: transformPath(pose.stripes.at(-1).path, 1, [0, 170]), opacity: 0,
  });
  if (name === "rest") {
    const eyes = source.elements.filter(e => e.tag === "path" && e.style.stroke === "#fff");
    pose.closedEyes = eyes.map(e => transformPath(toLottie(cubicPath(e.attrs.d)), scale, offset));
    pose.closedEyeStroke = strokeWidth(eyes[0]) * scale;
    pose.eyes = pose.closedEyes.map(e => [(e.v[0][0] + e.v.at(-1)[0]) / 2, e.v[0][1]]);
    const zs = source.elements.filter(e => e.tag === "polyline").sort((a, b) => parseFloat(a.attrs.points) - parseFloat(b.attrs.points));
    pose.zs = zs.map(e => {
      const n = e.attrs.points.trim().split(/[\s,]+/).map(Number);
      return transformPath(path(Array.from({ length: n.length / 2 }, (_, i) => n.slice(i * 2, i * 2 + 2))), scale, offset);
    });
    pose.zStroke = strokeWidth(zs[0]) * scale;
    pose.openEyesOpacity = 0; pose.closedEyesOpacity = 100; pose.zOpacity = 100;
  } else {
    const eyes = source.elements.filter(e => e.tag === "ellipse");
    pose.eyes = eyes.map(e => point(svgPoint([Number(e.attrs.cx), Number(e.attrs.cy)], e.attrs.transform)));
    pose.eyeRotations = eyes.map(e => Number(e.attrs.transform.match(/rotate\(([-\d.]+)/)[1]) + (Number(e.attrs.ry) > Number(e.attrs.rx) ? 90 : 0));
    pose.eyeSize = [8.84 * scale, 4.42 * scale];
    pose.eyeStroke = strokeWidth(eyes[0]) * scale;
    pose.closedEyes = POSES.good.closedEyes.map((shape, i) => transformPath(shape, 1, pose.eyes[i].map((v, axis) => v - POSES.good.eyes[i][axis])));
  }
  pose.cheeks = pose.eyes.map((p, i) => p.map((v, axis) => v + POSES.happy.cheeks[i][axis] - POSES.happy.eyes[i][axis]));
  return pose;
}

export const EXPRESSION_POSES = { good: base(POSES.good), happy: base(POSES.happy), angry: imported("angry"), rest: imported("rest") };
export const EXPRESSION_SOURCES = {
  files: { ...SOURCE_MANIFEST.files, ...Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, { sha256: s.hash, viewBox: s.viewBox }])) },
  transforms: { ...SOURCE_MANIFEST.transforms, ...transforms },
  stateSources: { good: "good.svg", bad: "angry.svg", paused: "rest.svg", recovery: "happy.svg" },
  bodyWidth: 226, viewportTranslation: [260, 0],
  shadow: "Existing platform CSS shadow; original SVG filters are retained in source files only",
};
