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

export interface Chapter {
  id: string;
  world_id: string;
  title: string;
  manuscript_order: number;
  story_time_ref: number | null;
  body: string;
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
  known_by: { concealed_from?: string[] } | null;
  note: string | null;
  created_at: string;
  participants: StreamParticipant[];
}
