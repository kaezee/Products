// Minimal ambient types for Intl.Segmenter — supported by every browser we target
// and by Node, but not in this project's TS lib (ES2020). Kept tiny: just what
// lib/offers.ts uses (sentence segmentation).
declare namespace Intl {
  interface SegmentData {
    segment: string;
    index: number;
    input: string;
    isWordLike?: boolean;
  }
  interface Segments {
    [Symbol.iterator](): IterableIterator<SegmentData>;
  }
  interface Segmenter {
    segment(input: string): Segments;
  }
  const Segmenter: {
    new (locales?: string | string[], options?: { granularity?: "grapheme" | "word" | "sentence" }): Segmenter;
  };
}
