import { describe, it, expect } from "vitest";
import { plural, familyOf, buildTypeSwatches, BUILTIN_SWATCH, ENTITY_SWATCHES } from "./entityTypes";

describe("plural", () => {
  it("handles regular, -y, and sibilant endings", () => {
    expect(plural("Place")).toBe("Places");
    expect(plural("Faction")).toBe("Factions");
    expect(plural("City")).toBe("Cities");    // consonant + y → ies
    expect(plural("Box")).toBe("Boxes");        // x → es
    expect(plural("Church")).toBe("Churches");  // ch → es
  });

  it("does not turn a vowel+y into -ies", () => {
    expect(plural("Day")).toBe("Days");
  });
});

describe("familyOf", () => {
  it("maps built-in types to their graph family", () => {
    expect(familyOf("Character")).toBe("being");
    expect(familyOf("Creature")).toBe("being");
    expect(familyOf("Place")).toBe("place");
    expect(familyOf("Faction")).toBe("group");
  });

  it("defaults writer-minted custom types to 'object', never a person or place", () => {
    expect(familyOf("Deity")).toBe("object");
    expect(familyOf("Prophecy")).toBe("object");
  });
});

describe("buildTypeSwatches", () => {
  it("gives every built-in its default swatch", () => {
    const m = buildTypeSwatches([], ["Character", "Place"]);
    expect(m.get("character")).toBe(BUILTIN_SWATCH.character);
    expect(m.get("place")).toBe(BUILTIN_SWATCH.place);
  });

  it("lets a registry row override the built-in default", () => {
    const m = buildTypeSwatches([{ name: "Character", swatch: "crimson" }], ["Character"]);
    expect(m.get("character")).toBe("crimson");
  });

  it("never leaves a custom type colourless", () => {
    const m = buildTypeSwatches([], ["Deity", "Prophecy"]);
    expect(ENTITY_SWATCHES).toContain(m.get("deity"));
    expect(ENTITY_SWATCHES).toContain(m.get("prophecy"));
  });
});
