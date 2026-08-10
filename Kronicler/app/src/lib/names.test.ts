import { describe, it, expect } from "vitest";
import { shortName } from "./names";

describe("shortName", () => {
  it("drops a leading honorific so a title never stands in for the name", () => {
    expect(shortName("Dr John Watson")).toBe("John");   // audit #11: was "Dr"
    expect(shortName("Mrs Hudson")).toBe("Hudson");
    expect(shortName("Professor Moriarty")).toBe("Moriarty");
  });

  it("keeps the given name when there is no honorific", () => {
    expect(shortName("Sherlock Holmes")).toBe("Sherlock");
    expect(shortName("Irene Adler")).toBe("Irene");
  });

  it("handles single words and blanks", () => {
    expect(shortName("Moriarty")).toBe("Moriarty");
    expect(shortName("Dr")).toBe("Dr"); // only a title, nothing to fall back to
    expect(shortName("")).toBe("");
  });
});
