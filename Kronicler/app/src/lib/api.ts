import { supabase } from "./supabase";
import type {
  World, Entity, Chapter, RelationshipType, StreamRow, ChapterVersion, ChapterEntity,
} from "./types";

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

export async function getChapters(worldId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, world_id, title, manuscript_order, story_time_ref, body")
    .eq("world_id", worldId)
    .is("deleted_at", null)
    .order("manuscript_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
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

// ── Chapters (the manuscript) ────────────────────────────────────────────

export async function createChapter(
  worldId: string,
  title: string,
  manuscriptOrder: number,
): Promise<Chapter> {
  const { data, error } = await supabase
    .from("chapters")
    .insert({ world_id: worldId, title, manuscript_order: manuscriptOrder })
    .select("id, world_id, title, manuscript_order, story_time_ref, body")
    .single();
  if (error) throw error;
  return data;
}

export async function updateChapterTitle(chapterId: string, title: string): Promise<void> {
  const { error } = await supabase.from("chapters").update({ title }).eq("id", chapterId);
  if (error) throw error;
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

// The in-prose composer's commit — atomic find-or-create relationship + append
// a state. Returns the new state id.
export async function appendPairwiseState(args: {
  worldId: string;
  entityA: string;
  entityB: string;
  typeId: string;
  manuscriptRef: string;
  note: string;
  concealedFrom?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("append_pairwise_state", {
    p_world_id: args.worldId,
    p_entity_a: args.entityA,
    p_entity_b: args.entityB,
    p_type_id: args.typeId,
    p_manuscript_ref: args.manuscriptRef,
    p_note: args.note,
    p_concealed_from: args.concealedFrom && args.concealedFrom.length > 0 ? args.concealedFrom : null,
  });
  if (error) throw error;
  return data as string;
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
