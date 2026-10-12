import { describe, expect, it } from "vitest";
import { telefoneLegivel } from "./telefone-legivel";

describe("telefoneLegivel", () => {
  it.each([
    ["+551920425772", "+55 19 2042-5772"],
    ["5519998765432", "+55 19 99876-5432"],
    ["+19392301037", "+1 939 230 1037"],
    ["+351912345678", "+351 912 345 678"],
    ["+34612345678", "+34 612 345 678"],
    ["+447700900123", "+44 7700 900123"],
    ["+31612345678", "+31 6 1234 5678"],
  ])("%s → %s", (cru, legivel) => {
    expect(telefoneLegivel(cru)).toBe(legivel);
  });
  it("vazio continua vazio", () => {
    expect(telefoneLegivel(null)).toBe("");
  });
});
