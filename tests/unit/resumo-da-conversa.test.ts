import { describe, expect, it } from "vitest";

import { MAX_MENSAGENS_NO_RESUMO, transcricaoParaResumo } from "@/lib/inbox/resumo-da-conversa";

describe("o que vai ao modelo no 'Resumir'", () => {
  it("em ordem cronológica, com quem falou, e mídia sem texto vira o tipo", () => {
    expect(
      transcricaoParaResumo([
        { direction: "outbound", body: "Temos sim!", created_at: "2026-10-05T10:01:00Z" },
        { direction: "inbound", body: "Tem horário amanhã?", created_at: "2026-10-05T10:00:00Z" },
        { direction: "inbound", body: null, type: "image", created_at: "2026-10-05T10:02:00Z" },
        { direction: "inbound", body: null, media_derived_text: "áudio: pode ser às 9", type: "audio", created_at: "2026-10-05T10:03:00Z" },
      ]),
    ).toBe("Cliente: Tem horário amanhã?\nEmpresa: Temos sim!\nCliente: [image]\nCliente: áudio: pode ser às 9");
  });

  it("só as últimas mensagens entram", () => {
    const muitas = Array.from({ length: MAX_MENSAGENS_NO_RESUMO + 5 }, (_, i) => ({
      direction: "inbound",
      body: `m${i}`,
      created_at: new Date(Date.UTC(2026, 9, 5, 0, i)).toISOString(),
    }));
    const linhas = transcricaoParaResumo(muitas).split("\n");
    expect(linhas).toHaveLength(MAX_MENSAGENS_NO_RESUMO);
    expect(linhas[0]).toBe("Cliente: m5");
  });
});
