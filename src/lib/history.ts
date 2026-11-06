export interface HistoryEntry {
  id: string;
  text: string;
  createdAt: number;
  pinned: boolean;
  remote: boolean;
}
const MAX_ITEMS = 50;
export function addHistory(
  items: HistoryEntry[],
  text: string,
  id: string,
  createdAt: number,
  remote: boolean,
): HistoryEntry[] {
  const pinned = items.filter((item) => item.pinned);
  const existing = pinned.find((item) => item.text === text);
  const entry: HistoryEntry = existing
    ? { ...existing, id, createdAt, remote }
    : { id, text, createdAt, remote, pinned: false };
  const next = [
    entry,
    ...items.filter(
      (item) => item.id !== entry.id && (item.pinned || item.text !== text),
    ),
  ];
  return [
    ...next.filter((item) => item.pinned),
    ...next.filter((item) => !item.pinned).slice(0, MAX_ITEMS - pinned.length),
  ];
}
export function togglePin(items: HistoryEntry[], id: string): HistoryEntry[] {
  return items.map((item) =>
    item.id === id ? { ...item, pinned: !item.pinned } : item,
  );
}
export function filterHistory(
  items: HistoryEntry[],
  query: string,
): HistoryEntry[] {
  return [
    ...items.filter((item) =>
      item.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ),
  ].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
  );
}
