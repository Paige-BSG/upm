export function findInvariantIds(text: string): string[] {
  return text.match(/SPEC-P1-[A-Z0-9-]+/g) ?? [];
}

export function checkInvariantUsage(
  catalog: Record<string, string>,
  codeBlob: string,
): { unused: string[]; dangling: string[] } {
  const used = new Set(findInvariantIds(codeBlob));
  const unused = Object.keys(catalog).filter((id) => !used.has(id));
  const dangling = [...used].filter((id) => catalog[id] === undefined);
  return { unused, dangling };
}
