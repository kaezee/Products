import type { CSSProperties } from "react";

// Loading affordances. A skeleton mirrors the shape of what's coming so the
// page doesn't jump when real content lands; a spinner covers inline waits
// (a button mid-action) where there's no shape to preview.

export function Skeleton({ w, h = 14, r = 6, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skel" style={{ width: w ?? "100%", height: h, borderRadius: r, ...style }} />;
}

// A small determinate-looking spinner for button/inline busy states.
export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spin" style={{ width: size, height: size }} aria-label="Loading" role="status" />;
}

// A card of shimmer rows — the default page skeleton for list/stream views.
export function SkeletonRows({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="fi">
      {title && (
        <>
          <Skeleton w={180} h={24} r={7} style={{ marginBottom: 8 }} />
          <Skeleton w={280} h={13} style={{ marginBottom: 18 }} />
        </>
      )}
      <div className="card">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="row" key={i} style={{ borderBottom: i === rows - 1 ? "none" : undefined }}>
            <Skeleton w={9} h={9} r={9} style={{ flex: "0 0 auto" }} />
            <Skeleton w={`${44 + ((i * 13) % 34)}%`} h={13} />
            <span className="spacer" style={{ flex: 1 }} />
            <Skeleton w={40} h={11} />
          </div>
        ))}
      </div>
    </div>
  );
}
