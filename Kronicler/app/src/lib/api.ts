import { supabase } from "./supabase";
import type { World, Entity, Chapter, RelationshipType, StreamRow } from "./types";

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
