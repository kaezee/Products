// Mirrors the Phase 0 schema (Kronicler/supabase/migrations). Kept hand-written
// for now; can be swapped for generated types later.

export type Valence = "bond" | "hostile" | "obligation" | "neutral";

export interface World {
  id: string;
  owner_id: string;
  name: string;
  // World clock (design doc 3). calendar is the writer's calendar config;
  // known time is their declared recorded history, and bounds the canvas.
  calendar?: import("./worldTime").Calendar;
  known_start_year?: number;
  known_end_year?: number;
  is_sample?: boolean; // the seeded example world (Sherlock Holmes)
  deleted_at?: string | null; // set only on trash reads
}

export interface Entity {
  id: string;
  world_id: string;
  type: string;
  title: string;
  aliases: string[];
  body: string;
  tags: string[];
  deleted_at?: string | null; // set only on trash reads
}

export interface RelationshipType {
  id: string;
  world_id: string;
  label: string;
  valence: Valence;
  color: string | null;
  is_ambient: boolean;
  is_terminal: boolean;
}

export interface Note {
  id: string;
  world_id: string;
  body: string;
  is_secret: boolean;
  entity_ids: string[];
  chapter_ids: string[];
  plan_ref: string | null;
  band_id: string | null;
  on_timeline: boolean;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
}

// §6 comments: a margin comment anchored to a range of a chapter's prose. The
// anchor is plain-text character offsets into the body (the editor's coordinate
// space); `quote` lets a comment re-find its spot, or flag itself detached, if
// the surrounding prose is edited.
export interface Comment {
  id: string;
  world_id: string;
  chapter_id: string;
  body: string;
  anchor_start: number;
  anchor_end: number;
  quote: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

// Where a chapter is in the writer's pipeline. Kept in sync with the legacy
// `planned` flag DB-side (planned ⇔ status === "planned").
export type ChapterStatus = "planned" | "draft" | "review" | "ready" | "on_hold";

export interface Chapter {
  id: string;
  world_id: string;
  title: string;
  manuscript_order: number;
  story_time_ref: number | null;
  story_time_label: string | null;
  body: string;
  band_id: string | null;
  segment_id: string | null;
  planned: boolean;
  status: ChapterStatus;
  // World clock (design doc 3). Authored date + precision is truth; day_num_* is
  // the derived cache the timeline positions on. anachronic = a flashback that
  // sits off its segment's span and renders as a tethered marker.
  time_year: number | null;
  time_month: number | null;
  time_day: number | null;
  time_precision: "year" | "month" | "day" | null;
  day_num_start: number | null;
  day_num_end: number | null;
  anachronic: boolean;
  deleted_at?: string | null; // set only on trash reads
}

// A world's entity type registry entry (design doc 2). Owns a curated swatch,
// a marker letter, and an underline style — the source of a mention's colour.
export interface EntityType {
  id: string;
  world_id: string;
  name: string;
  mark: string;
  swatch: string;      // one of the 12 curated entity swatches
  line_style: "solid" | "dotted" | "dashed";
  is_builtin: boolean;
  sort_order: number;
}

// A world's segment-kind registry entry (design doc 3 §4.3). Gives each kind
// (series/book/season/volume/arc + any custom) a curated swatch.
export interface SegmentKind {
  id: string;
  world_id: string;
  name: string;
  swatch: string;      // one of the 12 curated entity swatches
  is_builtin: boolean;
  sort_order: number;
}

// A node in the World Timeline tree: Series / Book / Season / Volume / anything,
// nested to any depth via parent_id. start_ref/end_ref are the drawn span; the
// effective span is auto-fit to its chapters + children (computed in the view).
export interface Segment {
  id: string;
  world_id: string;
  parent_id: string | null;
  kind: string;
  name: string;
  color: string | null;
  seg_order: number;
  start_ref: number | null;
  end_ref: number | null;
}

// A timeline-only marker: a labelled date line, an era/event, or a time-skip
// divider. Never part of the manuscript — pure planning annotation.
export interface TimelineMarker {
  id: string;
  world_id: string;
  kind: "date" | "event" | "timeskip" | "note";
  label: string | null;
  story_time_ref: number | null;
  story_time_label: string | null;
  story: string | null;
  color: string | null;
  time_year: number | null;
  time_month: number | null;
  time_day: number | null;
  time_precision: "year" | "month" | "day" | null;
  day_num_start: number | null;
  day_num_end: number | null;
}

export interface Band {
  id: string;
  world_id: string;
  name: string;
  band_order: number;
  color: string | null;
  time_frame: string | null;
  story: string | null;      // the SERIES this volume belongs to (lane)
  start_ref: number | null;  // in-world year the volume span begins
  end_ref: number | null;    // in-world year it ends
}

export interface ChapterVersion {
  id: string;
  chapter_id: string;
  body: string;
  created_at: string;
}

export interface ChapterEntity {
  chapter_id: string;
  entity_id: string;
  role: string;
}

export interface StreamParticipant {
  entity_id: string;
  title: string;
  role: string | null;
}

// One row of the relationship_state_stream view (the signature query).
export interface StreamRow {
  state_id: string;
  relationship_id: string;
  world_id: string;
  type_id: string;
  type_label: string;
  valence: Valence;
  is_ambient: boolean;
  story_time_ref: number | null;
  manuscript_ref: string | null;
  chapter_title: string | null;
  manuscript_order: number | null;
  is_correction: boolean;
  known_by: { concealed_from?: string[]; believed_by?: string[] } | null;
  note: string | null;
  created_at: string;
  participants: StreamParticipant[];
}
