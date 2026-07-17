// mammoth ships types for its main entry but not the browser subpath bundle we
// import for client-side .docx parsing. Minimal surface for what we use.
declare module "mammoth/mammoth.browser" {
  interface ConvertResult { value: string; messages: unknown[] }
  interface Input { arrayBuffer: ArrayBuffer }
  export function convertToHtml(input: Input): Promise<ConvertResult>;
  export function extractRawText(input: Input): Promise<ConvertResult>;
  const _default: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText };
  export default _default;
}
