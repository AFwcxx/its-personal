import { describe, expect, it } from "vitest";
import { noteInputSchema } from "../src/schemas.js";

const note = (valueCents: number) => ({
  title: "Calculation",
  content: "Item",
  contentStyle: "calculate",
  items: [{ id: "item", text: "Item", valueCents }]
});

describe("calculate notes", () => {
  it("stores exact cents only within JavaScript's safe integer range", () => {
    expect(noteInputSchema.safeParse(note(-125)).success).toBe(true);
    expect(noteInputSchema.safeParse(note(1.25)).success).toBe(false);
    expect(noteInputSchema.safeParse(note(Number.MAX_SAFE_INTEGER + 1)).success).toBe(false);
  });
});
