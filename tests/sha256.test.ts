import { describe, expect, it } from "vitest";
import { Sha256, sha256File } from "../apps/web/src/lib/sha256";

describe("Sha256", () => {
  it("matches empty and abc vectors", () => {
    const a = new Sha256();
    expect(a.digestHex()).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const b = new Sha256();
    b.update(new TextEncoder().encode("abc"));
    expect(b.digestHex()).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes a blob incrementally", async () => {
    const data = "hello anp ".repeat(8000);
    const blob = new Blob([data]);
    const hex = await sha256File(blob);
    const one = new Sha256();
    one.update(new TextEncoder().encode(data));
    expect(hex).toBe(one.digestHex());
  });
});
