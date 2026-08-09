import { supabase } from "./supabase";
import type {
  World, Entity, Chapter, ChapterStatus, Band, RelationshipType, StreamRow, ChapterVersion, ChapterEntity, Note, NoteSource, Comment, TimelineMarker, Segment, SegmentKind, EntityType,
} from "./types";
import { ENTITY_SWATCHES, BUILTIN_SWATCH } from "./entityTypes";
import { track } from "./analytics";

const ET_COLS = "id, world_id, name, mark, swatch, line_style, is_builtin, sort_order";

export async function getEntityTypes(worldId: string): Promise<EntityType[]> {
  const { data, error } = await supabase
    .from("entity_types").select(ET_COLS)
    .eq("world_id", worldId).order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EntityType[];
}

export async function createEntityType(
  worldId: string,
  t: { name: string; mark: string; swatch: string; line_style?: EntityType["line_style"]; sort_order?: number },
): Promise<EntityType> {
  const { data, error } = await supabase
    .from("entity_types")
    .insert({ world_id: worldId, name: t.name, mark: t.mark, swatch: t.swatch, line_style: t.line_style ?? "solid", sort_order: t.sort_order ?? 100 })
    .select(ET_COLS).single();
  if (error) throw error;
  return data as EntityType;
}

export async function updateEntityType(
  id: string,
  patch: Partial<Pick<EntityType, "name" | "mark" | "swatch" | "line_style" | "sort_order">>,
): Promise<void> {
  const { error } = await supabase.from("entity_types").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteEntityType(id: string): Promise<void> {
  const { error } = await supabase.from("entity_types").delete().eq("id", id);
  if (error) throw error;
}

// ── Notes (the planning board) ───────────────────────────────────────────

const NOTE_COLS = "id, world_id, body, is_secret, entity_ids, chapter_ids, plan_ref, band_id, on_timeline, x, y, w, h, source";

export async function getNotes(worldId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes").select(NOTE_COLS)
    .eq("world_id", worldId).is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function createNote(worldId: string, x: number, y: number, onTimeline = false, source: NoteSource = "app"): Promise<Note> {
  const { data, error } = await supabase
    .from("notes").insert({ world_id: worldId, x, y, on_timeline: onTimeline, source }).select(NOTE_COLS).single();
  if (error) throw error;
  track({ name: "note_created", props: { source } });
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

// ── comments (§6) ──────────────────────────────────────────────────────────
const COMMENT_COLS = "id, world_id, chapter_id, body, anchor_start, anchor_end, quote, anchor_prefix, anchor_suffix, anchor_status, resolved, created_at, updated_at";

// Until the 0024 migration is applied, the table is absent — degrade to an empty
// list rather than surfacing an error, so the editor works with or without it.
export async function getChapterComments(chapterId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments").select(COMMENT_COLS)
    .eq("chapter_id", chapterId).is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01") return []; // relation does not exist yet
    throw error;
  }
  return (data ?? []) as Comment[];
}

// All of a world's comments (for Overview's trail and the Book/World panel scope).
export async function getWorldComments(worldId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments").select(COMMENT_COLS)
    .eq("world_id", worldId).is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []) as Comment[];
}

export async function createComment(
  worldId: string, chapterId: string,
  patch: { body: string; anchor_start: number; anchor_end: number; quote: string; anchor_prefix?: string; anchor_suffix?: string },
): Promise<Comment> {
  const { data, error } = await supabase
    .from("comments").insert({ world_id: worldId, chapter_id: chapterId, ...patch }).select(COMMENT_COLS).single();
  if (error) throw error;
  return data as Comment;
}

export async function updateComment(
  id: string,
  patch: Partial<Pick<Comment, "body" | "resolved" | "anchor_start" | "anchor_end" | "quote" | "anchor_prefix" | "anchor_suffix" | "anchor_status">>,
): Promise<void> {
  const { error } = await supabase.from("comments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function softDeleteComment(id: string): Promise<void> {
  const { error } = await supabase
    .from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// All reads are RLS-scoped to the signed-in user's worlds, so no explicit
// owner filter is needed — the database enforces it.

export async function getMyWorlds(): Promise<World[]> {
  const { data, error } = await supabase
    .from("worlds")
    .select("id, owner_id, name, calendar, known_start_year, known_end_year, is_sample")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Build the seeded example world (Sherlock Holmes) for the current user and
// return its id. Server-side (migration 0023) — one round-trip, fully populated.
export async function seedSampleWorld(): Promise<string> {
  const { data, error } = await supabase.rpc("seed_sample_world");
  if (error) throw error;
  return data as string;
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

// The world clock for one world (calendar + known time). Used by the timeline.
export async function getWorld(id: string): Promise<World> {
  const { data, error } = await supabase
    .from("worlds").select("id, owner_id, name, calendar, known_start_year, known_end_year")
    .eq("id", id).single();
  if (error) throw error;
  return data as World;
}

export async function setKnownTime(id: string, startYear: number, endYear: number): Promise<void> {
  const { error } = await supabase.from("worlds")
    .update({ known_start_year: startYear, known_end_year: endYear }).eq("id", id);
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

// Onboarding §2.3/§2.4: seed a fresh project's shape — container level names as
// segment_kinds, and the genre's entity types as registry rows (styled, so they
// carry a swatch/mark the moment the writer uses them). All ordinary, renameable.
export async function seedProjectShape(worldId: string, containers: string[], typeNames: string[]): Promise<void> {
  const swatch = (i: number) => ENTITY_SWATCHES[i % ENTITY_SWATCHES.length];
  await Promise.all([
    ...containers.map((name, i) => createSegmentKind(worldId, { name, swatch: swatch(i), sort_order: (i + 1) * 10 })),
    ...typeNames.map((name, i) => createEntityType(worldId, {
      name,
      mark: name.slice(0, 1).toUpperCase(),
      swatch: BUILTIN_SWATCH[name.toLowerCase()] ?? swatch(i + containers.length),
      sort_order: (i + 1) * 10,
    })),
  ]);
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
  via = "manual", // "manual" | "detection" — how the entity was minted (analytics only)
): Promise<Entity> {
  const { data, error } = await supabase
    .from("entities")
    .insert({ world_id: worldId, type, title, body })
    .select("id, world_id, type, title, aliases, body, tags")
    .single();
  if (error) throw error;
  track({ name: "entity_created", props: { via } });
  if (via === "detection") track({ name: "entity_linked_from_detection" });
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
    .select("id, world_id, title, manuscript_order, story_time_ref, story_time_label, body, band_id, segment_id, planned, status, time_year, time_month, time_day, time_precision, day_num_start, day_num_end, anachronic")
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
    .select("id, world_id, name, band_order, color, time_frame, story, start_ref, end_ref")
    .eq("world_id", worldId).is("deleted_at", null)
    .order("band_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Band[];
}

export async function createBand(worldId: string, name: string, bandOrder: number): Promise<Band> {
  const { data, error } = await supabase
    .from("bands").insert({ world_id: worldId, name, band_order: bandOrder })
    .select("id, world_id, name, band_order, color, time_frame, story, start_ref, end_ref").single();
  if (error) throw error;
  return data as Band;
}

export async function updateBand(id: string, patch: Partial<Pick<Band, "name" | "band_order" | "color" | "time_frame" | "story" | "start_ref" | "end_ref">>): Promise<void> {
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

// ── World Timeline segments (the recursive Series/Book/Volume tree) ────────
const SEG_COLS = "id, world_id, parent_id, kind, name, color, seg_order, start_ref, end_ref";
export async function getSegments(worldId: string): Promise<Segment[]> {
  const { data, error } = await supabase
    .from("segments").select(SEG_COLS)
    .eq("world_id", worldId).is("deleted_at", null)
    .order("seg_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Segment[];
}
export async function createSegment(worldId: string, s: Partial<Segment>): Promise<Segment> {
  const { data, error } = await supabase.from("segments")
    .insert({ world_id: worldId, parent_id: s.parent_id ?? null, kind: s.kind ?? "segment", name: s.name ?? "New segment",
      color: s.color ?? null, seg_order: s.seg_order ?? 0, start_ref: s.start_ref ?? null, end_ref: s.end_ref ?? null })
    .select(SEG_COLS).single();
  if (error) throw error;
  return data as Segment;
}
export async function updateSegment(id: string, patch: Partial<Pick<Segment, "parent_id" | "kind" | "name" | "color" | "seg_order" | "start_ref" | "end_ref">>): Promise<void> {
  const { error } = await supabase.from("segments").update(patch).eq("id", id);
  if (error) throw error;
}
export async function softDeleteSegment(id: string): Promise<void> {
  const { error } = await supabase.from("segments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function restoreSegment(id: string): Promise<void> {
  const { error } = await supabase.from("segments").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}
export async function setChapterSegment(chapterId: string, segmentId: string | null): Promise<void> {
  const { error } = await supabase.from("chapters").update({ segment_id: segmentId }).eq("id", chapterId);
  if (error) throw error;
}
// Bulk-assign several chapters to one segment (the "move to season/book/volume"
// action). segmentId null unfiles them.
export async function setChaptersSegment(chapterIds: string[], segmentId: string | null): Promise<void> {
  if (chapterIds.length === 0) return;
  const { error } = await supabase.from("chapters").update({ segment_id: segmentId }).in("id", chapterIds);
  if (error) throw error;
}

// ── Segment kinds (series/book/season/volume/arc + custom) ────────────────
const SK_COLS = "id, world_id, name, swatch, is_builtin, sort_order";
export async function getSegmentKinds(worldId: string): Promise<SegmentKind[]> {
  const { data, error } = await supabase
    .from("segment_kinds").select(SK_COLS)
    .eq("world_id", worldId).order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SegmentKind[];
}
export async function createSegmentKind(worldId: string, k: { name: string; swatch: string; sort_order?: number }): Promise<SegmentKind> {
  const { data, error } = await supabase
    .from("segment_kinds")
    .insert({ world_id: worldId, name: k.name, swatch: k.swatch, sort_order: k.sort_order ?? 100 })
    .select(SK_COLS).single();
  if (error) throw error;
  return data as SegmentKind;
}
export async function updateSegmentKind(id: string, patch: Partial<Pick<SegmentKind, "name" | "swatch" | "sort_order">>): Promise<void> {
  const { error } = await supabase.from("segment_kinds").update(patch).eq("id", id);
  if (error) throw error;
}
export async function deleteSegmentKind(id: string): Promise<void> {
  const { error } = await supabase.from("segment_kinds").delete().eq("id", id);
  if (error) throw error;
}

// ── Timeline markers (date lines, era/events, time-skip dividers) ─────────
const MARKER_COLS = "id, world_id, kind, label, story_time_ref, story_time_label, story, color, time_year, time_month, time_day, time_precision, day_num_start, day_num_end";
export async function getMarkers(worldId: string): Promise<TimelineMarker[]> {
  const { data, error } = await supabase
    .from("timeline_markers").select(MARKER_COLS)
    .eq("world_id", worldId).is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as TimelineMarker[];
}
export async function createMarker(worldId: string, m: Partial<TimelineMarker> & { kind: TimelineMarker["kind"] }): Promise<TimelineMarker> {
  const { data, error } = await supabase
    .from("timeline_markers")
    .insert({ world_id: worldId, kind: m.kind, label: m.label ?? null, story_time_ref: m.story_time_ref ?? null, story_time_label: m.story_time_label ?? null, story: m.story ?? null, color: m.color ?? null,
      time_year: m.time_year ?? null, time_month: m.time_month ?? null, time_day: m.time_day ?? null, time_precision: m.time_precision ?? null, day_num_start: m.day_num_start ?? null, day_num_end: m.day_num_end ?? null })
    .select(MARKER_COLS).single();
  if (error) throw error;
  return data as TimelineMarker;
}
export async function updateMarker(id: string, patch: Partial<Pick<TimelineMarker, "label" | "story_time_ref" | "story_time_label" | "story" | "color">>): Promise<void> {
  const { error } = await supabase.from("timeline_markers").update(patch).eq("id", id);
  if (error) throw error;
}
export async function softDeleteMarker(id: string): Promise<void> {
  const { error } = await supabase.from("timeline_markers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function restoreMarker(id: string): Promise<void> {
  const { error } = await supabase.from("timeline_markers").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}

// The chapter's in-world time — a sortable integer (a year, a day-count, any
// increasing scale) that places it on the CHRONOLOGICAL axis, independent of its
// narrative (manuscript) position. This is what makes flashbacks sort right.
export async function setChapterStoryTime(chapterId: string, storyTime: number | null): Promise<void> {
  const { error } = await supabase.from("chapters").update({ story_time_ref: storyTime }).eq("id", chapterId);
  if (error) throw error;
}

// The in-world DATE: a display label ("1150 AE") plus the sortable integer key
// parsed from it (see lib/time). Also mirrors it into the world-clock columns as
// a year-precision date so it lands on the new timeline immediately. Free-text
// only yields a year, so precision is 'year'; the default 360-day calendar is
// assumed until a structured date editor + per-world calendar land (doc 3 §12).
const DEFAULT_DAYS_PER_YEAR = 360;
export async function setChapterDate(chapterId: string, storyTimeRef: number | null, label: string | null): Promise<void> {
  const clock = storyTimeRef == null
    ? { time_year: null, time_month: null, time_day: null, time_precision: null, day_num_start: null, day_num_end: null }
    : {
        time_year: storyTimeRef, time_month: 1, time_day: 1, time_precision: "year",
        day_num_start: storyTimeRef * DEFAULT_DAYS_PER_YEAR,
        day_num_end: storyTimeRef * DEFAULT_DAYS_PER_YEAR + DEFAULT_DAYS_PER_YEAR - 1,
      };
  const { error } = await supabase.from("chapters")
    .update({ story_time_ref: storyTimeRef, story_time_label: label, ...clock })
    .eq("id", chapterId);
  if (error) throw error;
}

// Structured in-world date (design doc 3 §12): authored {year,month,day} +
// precision, with the derived day-numbers and a display label. The caller
// computes day-numbers from the world calendar (lib/worldTime). Pass null to clear.
export async function setChapterStructuredDate(
  chapterId: string,
  fields: {
    time_year: number; time_month: number | null; time_day: number | null;
    time_precision: "year" | "month" | "day"; day_num_start: number; day_num_end: number;
    story_time_label: string; story_time_ref: number;
  } | null,
): Promise<void> {
  const patch = fields ?? {
    time_year: null, time_month: null, time_day: null, time_precision: null,
    day_num_start: null, day_num_end: null, story_time_label: null, story_time_ref: null,
  };
  const { error } = await supabase.from("chapters").update(patch).eq("id", chapterId);
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
  extra: { planned?: boolean; band_id?: string | null; story_time_ref?: number | null; story_time_label?: string | null } = {},
): Promise<Chapter> {
  const { data, error } = await supabase
    .from("chapters")
    .insert({ world_id: worldId, title, manuscript_order: manuscriptOrder, body, ...extra })
    .select("id, world_id, title, manuscript_order, story_time_ref, story_time_label, body, band_id, segment_id, planned, status, time_year, time_month, time_day, time_precision, day_num_start, day_num_end, anachronic")
    .single();
  if (error) throw error;
  track({ name: "chapter_created" });
  return data;
}

// A planned chapter is a placeholder beat; writing it clears the flag.
export async function setChapterPlanned(chapterId: string, planned: boolean): Promise<void> {
  const { error } = await supabase.from("chapters").update({ planned }).eq("id", chapterId);
  if (error) throw error;
}

// Where a chapter sits in the pipeline (Planned/Draft/Review/Ready/On Hold). A
// DB trigger keeps the legacy `planned` flag in sync, so callers set only this.
export async function setChapterStatus(chapterId: string, status: ChapterStatus): Promise<void> {
  const { error } = await supabase.from("chapters").update({ status }).eq("id", chapterId);
  if (error) throw error;
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
  source?: string;        // the mark gesture (popover/shortcut/offer); analytics only
  chapterWords?: number;  // words in the chapter it was marked from; analytics only
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
  track({ name: "moment_marked", props: { source: args.source ?? (args.manuscriptRef ? "composer" : "standing"), ...(args.chapterWords != null ? { chapter_words: args.chapterWords } : {}) } });
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
  source?: string;        // the mark gesture (popover/shortcut/offer); analytics only
  chapterWords?: number;  // words in the chapter it was marked from; analytics only
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
  track({ name: "moment_marked", props: { source: args.source ?? (args.manuscriptRef ? "composer" : "standing"), ...(args.chapterWords != null ? { chapter_words: args.chapterWords } : {}) } });
  return data as string;
}

// Attribute a state as a belief (or set any known_by shape). A belief carries
// { believed_by: [ids] } — what those characters think is true, which the lens
// substitutes over the truth. Passing null clears it back to objective truth.
// Attach (or repair) a prose anchor on a state. status defaults to 'ok'; the
// resolver passes 'stale' when a quote can no longer be found.
export async function setStateAnchor(
  stateId: string,
  a: { quote: string; prefix: string; suffix: string; start: number; end: number },
  status: "ok" | "stale" = "ok",
): Promise<void> {
  const { error } = await supabase.from("relationship_states").update({
    anchor_quote: a.quote, anchor_prefix: a.prefix, anchor_suffix: a.suffix,
    anchor_start: a.start, anchor_end: a.end, anchor_status: status,
  }).eq("id", stateId);
  if (error) throw error;
}

// Mark an anchor stale (the quote can no longer be found) without touching the
// rest of the row — the repair path shows it, the writer re-anchors or deletes.
export async function setStateAnchorStatus(stateId: string, status: "ok" | "stale"): Promise<void> {
  const { error } = await supabase.from("relationship_states").update({ anchor_status: status }).eq("id", stateId);
  if (error) throw error;
}

// Delete a single moment. relationship_states is append-only with no deleted_at,
// so this is a hard delete — used by the repair path when a moment's prose is gone.
export async function deleteState(stateId: string): Promise<void> {
  const { error } = await supabase.from("relationship_states").delete().eq("id", stateId);
  if (error) throw error;
}

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
  const [entities, chapters, bands, notes, types, rels, timeline_markers] = await Promise.all([
    grab("entities"), grab("chapters"), grab("bands"), grab("notes"), grab("relationship_types"), grab("relationships"), grab("timeline_markers"),
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
    entities, chapters, chapter_entities, bands, notes, timeline_markers,
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
    .select("id, world_id, title, manuscript_order, story_time_ref, story_time_label, body, band_id, segment_id, planned, status, time_year, time_month, time_day, time_precision, day_num_start, day_num_end, anachronic, deleted_at")
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

// Trash badge count — soft-deleted entities + chapters (this world) + worlds
// (account). Cheap head-only counts; the modal fetches the rows themselves.
export async function getTrashCount(worldId: string): Promise<number> {
  const [e, c, w] = await Promise.all([
    supabase.from("entities").select("id", { count: "exact", head: true }).eq("world_id", worldId).not("deleted_at", "is", null),
    supabase.from("chapters").select("id", { count: "exact", head: true }).eq("world_id", worldId).not("deleted_at", "is", null),
    supabase.from("worlds").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
  ]);
  if (e.error) throw e.error; if (c.error) throw c.error; if (w.error) throw w.error;
  return (e.count ?? 0) + (c.count ?? 0) + (w.count ?? 0);
}

// Permanently erase one trashed item and everything that hangs off it, in
// FK-safe order (server-side, ownership-checked). Irreversible — the counterpart
// to the 30-day auto-purge. See migration 0022.
export async function purgeTrashItem(kind: "entity" | "chapter" | "world", id: string): Promise<void> {
  const { error } = await supabase.rpc("purge_trash_item", { p_kind: kind, p_id: id });
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
