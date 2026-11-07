import { describe, expect, it } from "vitest";
import { addHistory, filterHistory, togglePin } from "../src/lib/history";
const item = {
  id: "a",
  text: "one",
  createdAt: 1,
  pinned: false,
  remote: false,
};
describe("local clipboard history", () => {
  it("keeps the last fifty and deduplicates repeated text", () => {
    let items = [item];
    for (let i = 2; i <= 52; i++)
      items = addHistory(items, `text ${i}`, String(i), i, false);
    expect(items).toHaveLength(50);
    expect(items.at(-1)?.text).toBe("text 3");
    items = addHistory(items, "text 10", "again", 60, false);
    expect(items).toHaveLength(50);
    expect(items[0]?.text).toBe("text 10");
  });
  it("retains pinned entries and sorts them first", () => {
    let items = togglePin([item], "a");
    for (let i = 0; i < 60; i++)
      items = addHistory(items, `text ${i}`, String(i), i, false);
    expect(items).toHaveLength(50);
    expect(items.find((entry) => entry.id === "a")?.pinned).toBe(true);
    expect(filterHistory(items, "one")[0]?.id).toBe("a");
  });
  it("searches case-insensitively", () => {
    expect(filterHistory([item], "ONE")).toHaveLength(1);
    expect(filterHistory([item], "none")).toHaveLength(0);
  });
});
