import type { NodeFamily } from "./entityTypes";

// Pure SVG geometry for the five node shapes. Returns a tag + attributes so the
// same maths drives both the React renderer and any test/preview harness — no
// JSX in here. `r` is the nominal radius (a circle of that radius); the other
// shapes are area-tuned to that circle so no shape reads as heavier than another
// at equal degree.
export interface ShapeGeom {
  tag: "circle" | "rect" | "polygon";
  attrs: Record<string, string | number>;
}

// Regular polygon points, `n` vertices on a circle of radius `rad`, first vertex
// at angle `rot` (radians, measured from +x, y-down SVG space).
function poly(cx: number, cy: number, rad: number, n: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(3)},${(cy + rad * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(" ");
}

export function shapeGeom(family: NodeFamily, cx: number, cy: number, r: number): ShapeGeom {
  switch (family) {
    case "being": // circle — the baseline
      return { tag: "circle", attrs: { cx, cy, r } };
    case "place": { // rounded square, area-matched (side ≈ r·√π)
      const s = r * 1.77;
      return { tag: "rect", attrs: { x: cx - s / 2, y: cy - s / 2, width: s, height: s, rx: s * 0.22 } };
    }
    case "group": // hexagon, flat-top, slightly enlarged to match visual weight
      return { tag: "polygon", attrs: { points: poly(cx, cy, r * 1.12, 6, 0) } };
    case "object": // diamond (square rotated 45°)
      return { tag: "polygon", attrs: { points: poly(cx, cy, r * 1.28, 4, -Math.PI / 2) } };
    case "moment": // upward triangle, enlarged (triangles look small at equal r)
      return { tag: "polygon", attrs: { points: poly(cx, cy, r * 1.42, 3, -Math.PI / 2) } };
  }
}
