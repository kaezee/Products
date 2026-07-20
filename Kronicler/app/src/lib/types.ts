// Mirrors the Phase 0 schema (Kronicler/supabase/migrations). Kept hand-written
// for now; can be swapped for generated types later.

export type Valence = "bond" | "hostile" | "obligation" | "neutral";

export interface World {
  id: string;
  owner_id: string;
  name: string;
}

export interface Entity {
  id: string;
  world_id: string;
  type: string;
  title: string;
  aliases: string[];
  body: string;
  tags: string[];
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

export interface Chapter {
  id: string;
  world_id: string;
  title: string;
  manuscript_order: number;
  story_time_ref: number | null;
  story_time_label: string | null;
  body: string;
  band_id: string | null;
  planned: boolean;
}

// A timeline-only marker: a labelled date line, an era/event, or a time-skip
// divider. Never part of the manuscript — pure planning annotation.
export interface TimelineMarker {
  id: string;
  world_id: string;
  kind: "date" | "event" | "timeskip";
  label: string | null;
  story_time_ref: number | null;
  story_time_label: string | null;
  story: string | null;
  color: string | null;
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
