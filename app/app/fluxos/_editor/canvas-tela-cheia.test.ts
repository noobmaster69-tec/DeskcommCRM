import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O canvas de Fluxos ocupa a tela inteira (item 8). O <main> da casca tem
 * `p-6` e nenhuma altura definida: sem desfazer os dois, o canvas ficava
 * numa moldura de 600px com borda branca — o oposto do Leona.
 */
const pagina = readFileSync("app/app/fluxos/[id]/page.tsx", "utf8");
const builder = readFileSync("app/app/ai/followups/[id]/_components/FlowBuilder.tsx", "utf8");
const canvas = readFileSync("app/app/ai/followups/[id]/_components/FlowCanvas.tsx", "utf8");

describe("canvas de Fluxos de ponta a ponta", () => {
  it("a página desfaz o p-6 da casca e usa a altura da tela menos o topo", () => {
    expect(pagina).toMatch(/-m-6 flex h-\[calc\(100dvh-3\.5rem\)\]/);
  });

  it("o piso de 600px fica só para o follow-up", () => {
    expect(builder).toMatch(/surface === "fluxo" \? "min-h-0" : "min-h-\[600px\]"/);
    expect(canvas).toMatch(/isFluxo \? "min-h-0" : "min-h-\[600px\]"/);
  });

  it("enquadra quando há blocos; vazio, centraliza a origem", () => {
    expect(canvas).toMatch(/fitView=\{initial\.nodes\.length > 0\}/);
    expect(canvas).toMatch(/onInit=\{onInit\}/);
    expect(canvas).toMatch(/setViewport\(\{ x: rect\.width \/ 2 - 120, y: rect\.height \/ 2 - 50, zoom: 1 \}\)/);
  });
});
