/**
 * O Inbox abre em "Todas" e lembra a última aba (fork jhoow, P4).
 *
 * A regra mora em `lib/inbox/aba-do-inbox.ts`; o `InboxLayout` só a liga. Os
 * casos com ⭐ são os que o dono do produto pediu; os outros são as bordas que
 * fariam a regra mentir (aba invisível, valor velho no storage).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  abaPadraoDoInbox,
  chaveDaAbaDoInbox,
  ehAbaDoInbox,
  lerAbaGravada,
} from "@/lib/inbox/aba-do-inbox";

describe("a aba de quem não escolheu nada", () => {
  it("⭐ admin, manager e viewer abrem em Todas", () => {
    expect(abaPadraoDoInbox("admin", undefined)).toBe("all");
    expect(abaPadraoDoInbox("manager", "own_and_unassigned")).toBe("all");
    expect(abaPadraoDoInbox("viewer", undefined)).toBe("all");
  });

  it("agent que VÊ Todas abre nela", () => {
    expect(abaPadraoDoInbox("agent", "all")).toBe("all");
  });

  it("agent com visibilidade restrita não abre numa aba que ele não vê — fica a Fila", () => {
    expect(abaPadraoDoInbox("agent", "own_and_unassigned")).toBe("unassigned");
    expect(abaPadraoDoInbox("agent", undefined)).toBe("unassigned");
  });

  it("sem organização carregada ainda, o padrão é Todas (o mesmo no servidor e no navegador)", () => {
    expect(abaPadraoDoInbox(null, undefined)).toBe("all");
  });
});

describe("a aba gravada", () => {
  const todas = ["unassigned", "mine", "all", "closed", "archived", "ai"] as const;

  it("⭐ volta a aba que a pessoa escolheu", () => {
    expect(lerAbaGravada("closed", todas)).toBe("closed");
    expect(lerAbaGravada("mine", todas)).toBe("mine");
  });

  it("ignora valor desconhecido, vazio ou ausente", () => {
    expect(lerAbaGravada(null, todas)).toBeNull();
    expect(lerAbaGravada("", todas)).toBeNull();
    expect(lerAbaGravada("fila", todas)).toBeNull();
    expect(ehAbaDoInbox("{}")).toBe(false);
  });

  it("ignora aba que a pessoa deixou de ver (o papel mudou desde que gravou)", () => {
    expect(lerAbaGravada("all", ["unassigned", "mine"])).toBeNull();
  });

  it("a memória é por usuário E por organização", () => {
    expect(chaveDaAbaDoInbox("u1", "org-a")).not.toBe(chaveDaAbaDoInbox("u1", "org-b"));
    expect(chaveDaAbaDoInbox("u1", "org-a")).not.toBe(chaveDaAbaDoInbox("u2", "org-a"));
  });
});

describe("a fiação no InboxLayout", () => {
  const fonte = readFileSync("components/inbox/InboxLayout.tsx", "utf8");

  it("o padrão da URL vazia vem da regra, não de um literal 'unassigned'", () => {
    expect(fonte).toMatch(/parseFilterParam\(filtroNaUrl, abaPadrao\)/);
    expect(fonte).not.toMatch(/: "unassigned";\n\}/);
  });

  it("⭐ trocar de aba grava a escolha; abrir sem ?filter= lê a gravada", () => {
    expect(fonte).toMatch(/localStorage\.setItem\(chaveDaAba, next\.tab\)/);
    expect(fonte).toMatch(/lerAbaGravada\(window\.localStorage\.getItem\(chaveDaAba\)/);
  });
});
