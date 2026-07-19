import { supabase } from "./supabase";
import type {
  World, Entity, Chapter, Band, RelationshipType, StreamRow, ChapterVersion, ChapterEntity, Note,
} from "./types";

// ── Notes (the planning board) ───────────────────────────────────────────

const NOTE_COLS = "id, world_id, body, is_secret, entity_ids, chapter_ids, plan_ref, band_id, on_timeline, x, y, w, h";

export async function getNotes(worldId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes").select(NOTE_COLS)
    .eq("world_id", worldId).is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function createNote(worldId: string, x: number, y: number, onTimeline = false): Promise<Note> {
  const { data, error } = await supabase
    .from("notes").insert({ world_id: worldId, x, y, on_timeline: onTimeline }).select(NOTE_COLS).single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "body" | "is_secret" | "entity_ids" | "chapter_ids" | "plan_ref" | "band_id" | "on_timeline" | "x" | "y" | "w" | "h">>,
): Promise<void> {
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function softDeleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// All reads are RLS-scoped to the signed-in user's worlds, so no explicit
// owner filter is needed — the database enforces it.

export async function getMyWorlds(): Promise<World[]> {
  const { data, error } = await supabase
    .from("worlds")
    .select("id, owner_id, name")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Soft-delete a whole world. RLS ensures only the owner can. Everything under
// it (entities, chapters, relationships) stays in the row but is filtered out
// by the `deleted_at is null` reads, so it's recoverable, never truly gone.
export async function softDeleteWorld(id: string): Promise<void> {
  const { error } = await supabase
    .from("worlds")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function renameWorld(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("worlds").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function createWorld(name: string): Promise<World> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in.");
  const { data, error } = await supabase
    .from("worlds")
    .insert({ name, owner_id: ownerId })
    .select("id, owner_id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function getEntities(worldId: string): Promise<Entity[]> {
  const { data, error } = await supabase
    .from("entities")
    .select("id, world_id, type, title, aliases, body, tags")
    .eq("world_id", worldId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEntity(
  worldId: string,
  type: string,
  title: string,
  body = "",
): Promise<Entity> {
  const { data, error } = await supabase
    .from("entities")
    .insert({ world_id: worldId, type, title, body })
    .select("id, world_id, type, title, aliases, body, tags")
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntity(
  id: string,
  patch: Partial<Pick<Entity, "title" | "type" | "aliases" | "body">>,
): Promise<void> {
  const { error } = await supabase.from("entities").update(patch).eq("id", id);
  if (error) throw error;
}

// Rename a Library section: move every entity of one type to another. Renaming
// onto an existing type merges the two sections.
export async function renameEntityType(worldId: string, oldType: string, newType: string): Promise<void> {
  const { error } = await supabase
    .from("entities")
    .update({ type: newType })
    .eq("world_id", worldId)
    .eq("type", oldType);
  if (error) throw error;
}

export async function softDeleteEntity(id: string): Promise<void> {
  const { error } = await supabase
    .from("entities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getChapters(worldId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, world_id, title, manuscript_order, story_time_ref, body, band_id")
    .eq("world_id", worldId)
    .is("deleted_at", null)
    .order("manuscript_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ── Timeline bands (Novel 1 / Season 4 / the Spin-off) ────────────────────
export async function getBands(worldId: string): Promise<Band[]> {
  const { data, error } = await supabase
    .from("bands")
    .select("id, world_id, name, band_order, color, time_frame")
    .eq("world_id", worldId).is("deleted_at", null)
    .order("band_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Band[];
}

export async function createBand(worldId: string, name: string, bandOrder: number): Promise<Band> {
  const { data, error } = await supabase
    .from("bands").insert({ world_id: worldId, name, band_order: bandOrder })
    .select("id, world_id, name, band_order, color, time_frame").single();
  if (error) throw error;
  return data as Band;
}

export async function updateBand(id: string, patch: Partial<Pick<Band, "name" | "band_order" | "color" | "time_frame">>): Promise<void> {
  const { error } = await supabase.from("bands").update(patch).eq("id", id);
  if (error) throw error;
}

export async function softDeleteBand(id: string): Promise<void> {
  // the band goes; its chapters/notes fall back to unsorted (band_id kept but
  // the band is hidden, so the timeline treats them as unbanded)
  const { error } = await supabase.from("bands").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function setChapterBand(chapterId: string, bandId: string | null): Promise<void> {
  const { error } = await supabase.from("chapters").update({ band_id: bandId }).eq("id", chapterId);
  if (error) throw error;
}

// The chapter's in-world time — a sortable integer (a year, a day-count, any
// increasing scale) that places it on the CHRONOLOGICAL axis, independent of its
// narrative (manuscript) position. This is what makes flashbacks sort right.
export async function setChapterStoryTime(chapterId: string, storyTime: number | null): Promise<void> {
  const { error } = await supabase.from("chapters").update({ story_time_ref: storyTime }).eq("id", chapterId);
  if (error) throw error;
}

export async function getRelationshipTypes(worldId: string): Promise<RelationshipType[]> {
  const { data, error } = await supabase
    .from("relationship_types")
    .select("id, world_id, label, valence, color, is_ambient, is_terminal")
    .eq("world_id", worldId)
    .is("deleted_at", null)
    .order("label", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createRelationshipType(
  worldId: string,
  label: string,
  valence: RelationshipType["valence"],
): Promise<RelationshipType> {
  const { data, error } = await supabase
    .from("relationship_types")
    .insert({ world_id: worldId, label, valence })
    .select("id, world_id, label, valence, color, is_ambient, is_terminal")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRelationshipType(
  id: string,
  patch: Partial<Pick<RelationshipType, "label" | "valence" | "is_ambient" | "is_terminal" | "color">>,
): Promise<void> {
  const { error } = await supabase.from("relationship_types").update(patch).eq("id", id);
  if (error) throw error;
}

// Soft-delete a type. Callers should only offer this for unused types
// (destructive reassignment is a later feature).
export async function softDeleteRelationshipType(id: string): Promise<void> {
  const { error } = await supabase
    .from("relationship_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Chapters (the manuscript) ────────────────────────────────────────────

export async function createChapter(
  worldId: string,
  title: string,
  manuscriptOrder: number,
  body = "",
): Promise<Chapter> {
  const { data, error } = await supabase
    .from("chapters")
    .insert({ world_id: worldId, title, manuscript_order: manuscriptOrder, body })
    .select("id, world_id, title, manuscript_order, story_time_ref, body, band_id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateChapterTitle(chapterId: string, title: string): Promise<void> {
  const { error } = await supabase.from("chapters").update({ title }).eq("id", chapterId);
  if (error) throw error;
}

// Persist a full drag-and-drop reorder: write each chapter's new 1-based
// position. No unique constraint on manuscript_order, so intermediate states
// can't collide. Only the ids whose position actually changed are written.
export async function reorderChapters(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("chapters").update({ manuscript_order: i + 1 }).eq("id", id).then(({ error }) => {
        if (error) throw error;
      }),
    ),
  );
}

// Trustworthy autosave + bounded version trail — see save_chapter_body().
export async function saveChapterBody(chapterId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("save_chapter_body", {
    p_chapter_id: chapterId,
    p_body: body,
  });
  if (error) throw error;
}

export async function getChapterVersions(chapterId: string): Promise<ChapterVersion[]> {
  const { data, error } = await supabase
    .from("chapter_versions")
    .select("id, chapter_id, body, created_at")
    .eq("chapter_id", chapterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getChapterEntities(chapterId: string): Promise<ChapterEntity[]> {
  const { data, error } = await supabase
    .from("chapter_entities")
    .select("chapter_id, entity_id, role")
    .eq("chapter_id", chapterId);
  if (error) throw error;
  return data ?? [];
}

export async function linkChapterEntity(
  chapterId: string,
  entityId: string,
  role: "pov" | "present" | "mentioned" = "mentioned",
): Promise<void> {
  const { error } = await supabase
    .from("chapter_entities")
    .upsert({ chapter_id: chapterId, entity_id: entityId, role });
  if (error) throw error;
}

// Atomic find-or-create relationship + append a state. Returns the new state id.
// manuscriptRef is optional: the in-prose composer passes the chapter it was
// opened from; a standing connection declared on a character page passes none,
// and the state carries no story-time/chapter anchor.
export async function appendPairwiseState(args: {
  worldId: string;
  entityA: string;
  entityB: string;
  typeId: string;
  manuscriptRef?: string | null;
  note?: string;
  concealedFrom?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("append_pairwise_state", {
    p_world_id: args.worldId,
    p_entity_a: args.entityA,
    p_entity_b: args.entityB,
    p_type_id: args.typeId,
    p_manuscript_ref: args.manuscriptRef ?? null,
    p_note: args.note ?? null,
    p_concealed_from: args.concealedFrom && args.concealedFrom.length > 0 ? args.concealedFrom : null,
  });
  if (error) throw error;
  return data as string;
}

// Atomic find-or-create relationship + append a state over an arbitrary SET of
// participants (2+). Groups are one relationship with a shared history; see
// append_group_state. entityIds order doesn't matter (normalized server-side).
export async function appendGroupState(args: {
  worldId: string;
  entityIds: string[];
  typeId: string;
  manuscriptRef?: string | null;
  note?: string;
  concealedFrom?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("append_group_state", {
    p_world_id: args.worldId,
    p_entity_ids: args.entityIds,
    p_type_id: args.typeId,
    p_manuscript_ref: args.manuscriptRef ?? null,
    p_note: args.note ?? null,
    p_concealed_from: args.concealedFrom && args.concealedFrom.length > 0 ? args.concealedFrom : null,
  });
  if (error) throw error;
  return data as string;
}

// Attribute a state as a belief (or set any known_by shape). A belief carries
// { believed_by: [ids] } — what those characters think is true, which the lens
// substitutes over the truth. Passing null clears it back to objective truth.
export async function setStateKnownBy(
  stateId: string,
  knownBy: { concealed_from?: string[]; believed_by?: string[] } | null,
): Promise<void> {
  const { error } = await supabase.from("relationship_states").update({ known_by: knownBy }).eq("id", stateId);
  if (error) throw error;
}

// Fix a mistake in a connection: repoint a state to a different relationship
// type (and optionally its note). Append-only history is for story changes —
// a data-entry slip should just be correctable.
export async function updateStateType(stateId: string, typeId: string, note?: string | null): Promise<void> {
  const patch: { type_id: string; note?: string | null } = { type_id: typeId };
  if (note !== undefined) patch.note = note;
  const { error } = await supabase.from("relationship_states").update(patch).eq("id", stateId);
  if (error) throw error;
}

// Remove a whole connection (soft-delete the relationship; its states go with
// it via the stream's deleted_at filter). Recoverable, nothing truly lost.
export async function softDeleteRelationship(relationshipId: string): Promise<void> {
  const { error } = await supabase
    .from("relationships")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", relationshipId);
  if (error) throw error;
}

// Swap who a connection joins: replace one participant with another (keeps the
// other side and all history). For fixing "I connected the wrong person".
export async function swapParticipant(
  relationshipId: string,
  oldEntityId: string,
  newEntityId: string,
): Promise<void> {
  const del = await supabase.from("relationship_participants")
    .delete().eq("relationship_id", relationshipId).eq("entity_id", oldEntityId);
  if (del.error) throw del.error;
  const ins = await supabase.from("relationship_participants")
    .insert({ relationship_id: relationshipId, entity_id: newEntityId });
  if (ins.error) throw ins.error;
}

// ── Directional connections (per-side role words) ────────────────────────
// Direction lives in relationship_participants.role — no schema change. See
// lib/direction.ts for the model (mutual / two-way / one-way).

// The relationship a state belongs to (needed to set per-side roles after an
// append, which returns only the state id).
export async function relationshipIdForState(stateId: string): Promise<string> {
  const { data, error } = await supabase
    .from("relationship_states").select("relationship_id").eq("id", stateId).single();
  if (error) throw error;
  return (data as { relationship_id: string }).relationship_id;
}

// Set (or clear, with null) the directional word on each side of a connection.
export async function setConnectionRoles(
  relationshipId: string,
  roles: { entityId: string; role: string | null }[],
): Promise<void> {
  for (const r of roles) {
    const { error } = await supabase.from("relationship_participants")
      .update({ role: r.role })
      .eq("relationship_id", relationshipId).eq("entity_id", r.entityId);
    if (error) throw error;
  }
}

// ── Export (durability: get your whole world out) ────────────────────────
// A complete, self-contained snapshot of one world — every live row across all
// its tables — as a plain object ready to serialise to JSON.
export async function exportWorld(worldId: string, worldName: string): Promise<object> {
  const grab = async (table: string, col = "world_id") => {
    let q = supabase.from(table).select("*").eq(col, worldId);
    if (table !== "relationship_participants" && table !== "relationship_states" && table !== "chapter_entities") q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  };
  const [entities, chapters, bands, notes, types, rels] = await Promise.all([
    grab("entities"), grab("chapters"), grab("bands"), grab("notes"), grab("relationship_types"), grab("relationships"),
  ]);
  const relIds = rels.map((r: { id: string }) => r.id);
  const chIds = chapters.map((c: { id: string }) => c.id);
  let relationship_participants: unknown[] = [], relationship_states: unknown[] = [], chapter_entities: unknown[] = [];
  if (relIds.length) {
    const p = await supabase.from("relationship_participants").select("*").in("relationship_id", relIds);
    if (p.error) throw p.error; relationship_participants = p.data ?? [];
    const s = await supabase.from("relationship_states").select("*").in("relationship_id", relIds);
    if (s.error) throw s.error; relationship_states = s.data ?? [];
  }
  if (chIds.length) {
    const c = await supabase.from("chapter_entities").select("*").in("chapter_id", chIds);
    if (c.error) throw c.error; chapter_entities = c.data ?? [];
  }
  return {
    format: "kronicler-world-backup", version: 1, exported_at: new Date().toISOString(),
    world: { id: worldId, name: worldName },
    entities, chapters, chapter_entities, bands, notes,
    relationship_types: types, relationships: rels, relationship_participants, relationship_states,
  };
}

// ── Trash / restore (soft-deleted rows are recoverable) ──────────────────

export async function getDeletedEntities(worldId: string): Promise<Entity[]> {
  const { data, error } = await supabase
    .from("entities")
    .select("id, world_id, type, title, aliases, body, tags, deleted_at")
    .eq("world_id", worldId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Entity[];
}

export async function restoreEntity(id: string): Promise<void> {
  const { error } = await supabase.from("entities").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function getDeletedChapters(worldId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, world_id, title, manuscript_order, story_time_ref, body, band_id, deleted_at")
    .eq("world_id", worldId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Chapter[];
}

export async function restoreChapter(id: string): Promise<void> {
  const { error } = await supabase.from("chapters").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteChapter(id: string): Promise<void> {
  const { error } = await supabase
    .from("chapters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function getDeletedWorlds(): Promise<World[]> {
  const { data, error } = await supabase
    .from("worlds")
    .select("id, owner_id, name, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as World[];
}

export async function restoreWorld(id: string): Promise<void> {
  const { error } = await supabase.from("worlds").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// ── Doc view (Phase 4) ───────────────────────────────────────────────────

// The stream rows for every relationship a given entity participates in —
// powers the "connections woven in" section of the entity page.
export async function getEntityStream(entityId: string): Promise<StreamRow[]> {
  const { data: parts, error: pe } = await supabase
    .from("relationship_participants")
    .select("relationship_id")
    .eq("entity_id", entityId);
  if (pe) throw pe;
  const relIds = [...new Set((parts ?? []).map((p) => p.relationship_id))];
  if (relIds.length === 0) return [];
  const { data, error } = await supabase
    .from("relationship_state_stream")
    .select("*")
    .in("relationship_id", relIds)
    .eq("is_correction", false)
    .order("manuscript_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StreamRow[];
}

export interface EntityChapter {
  chapter_id: string;
  role: string;
  title: string;
  manuscript_order: number;
}

// Which chapters an entity appears in (from chapter_entities), with role.
export async function getEntityChapters(entityId: string): Promise<EntityChapter[]> {
  const { data, error } = await supabase
    .from("chapter_entities")
    .select("chapter_id, role, chapters(title, manuscript_order)")
    .eq("entity_id", entityId);
  if (error) throw error;
  type Row = { chapter_id: string; role: string; chapters: { title: string; manuscript_order: number } | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      chapter_id: r.chapter_id,
      role: r.role,
      title: r.chapters?.title ?? "",
      manuscript_order: r.chapters?.manuscript_order ?? 0,
    }))
    .sort((a, b) => a.manuscript_order - b.manuscript_order);
}

// The signature query. Canonical timeline-of-record read: corrections excluded,
// ordered by manuscript position (nulls last).
export async function getStream(worldId: string): Promise<StreamRow[]> {
  const { data, error } = await supabase
    .from("relationship_state_stream")
    .select("*")
    .eq("world_id", worldId)
    .eq("is_correction", false)
    .order("manuscript_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StreamRow[];
}
