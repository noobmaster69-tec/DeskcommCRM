"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { TIPOS_DE_VARIAVEL, VARIAVEIS_DO_SISTEMA, type TipoDeVariavel } from "@/lib/variables/sistema";
import { CAMPOS_DO_CONTATO } from "@/lib/variables/campos-do-contato";
import type { VariavelPersonalizada } from "@/lib/variables/definicoes";

const ROTULO_DO_TIPO: Record<TipoDeVariavel, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  booleano: "Sim/Não",
  selecao: "Seleção",
};

/** "Interesse principal" → "interesse_principal" — a chave sugerida a partir do nome. */
export function chaveDoRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
}

export function VariaveisClient({ inicial, podeEditar }: { inicial: VariavelPersonalizada[]; podeEditar: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ocupado, startTransition] = useTransition();
  const [rotulo, setRotulo] = useState("");
  const [chave, setChave] = useState("");
  const [chaveTocada, setChaveTocada] = useState(false);
  const [tipo, setTipo] = useState<TipoDeVariavel>("texto");
  const [opcoes, setOpcoes] = useState("");
  const [padrao, setPadrao] = useState("");
  const [noPerfil, setNoPerfil] = useState(true);

  const chaveFinal = chaveTocada ? chave : chaveDoRotulo(rotulo);

  const chamar = (url: string, method: string, corpo: unknown, sucesso: string, depois?: () => void) =>
    startTransition(async () => {
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      }).catch(() => null);
      const json = (await resp?.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!resp?.ok) {
        toast.error(json?.error?.message ?? t("Não foi possível salvar a variável."));
        return;
      }
      toast.success(t(sucesso));
      depois?.();
      router.refresh();
    });

  function criar() {
    chamar(
      "/api/v1/variaveis",
      "POST",
      {
        key: chaveFinal,
        label: rotulo.trim(),
        type: tipo,
        options: tipo === "selecao" ? opcoes.split(",").map((o) => o.trim()).filter(Boolean) : [],
        default_value: padrao.trim() || null,
        position: inicial.length,
        visible_in_profile: noPerfil,
      },
      "Variável criada.",
      () => {
        setRotulo("");
        setChave("");
        setChaveTocada(false);
        setTipo("texto");
        setOpcoes("");
        setPadrao("");
      },
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Variáveis")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Use {chave} nas mensagens de campanha e nos blocos de Fluxo. O valor de cada contato fica na ficha dele.")}
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="vars-sistema">
        <h2 id="vars-sistema" className="text-base font-semibold">
          {t("Do sistema")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("Calculadas sozinhas para cada contato. Não precisam de configuração.")}
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="variaveis-do-sistema">
            <tbody>
              {VARIAVEIS_DO_SISTEMA.map((v) => (
                <tr key={v.chave} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{`{${v.chave}}`}</td>
                  <td className="px-3 py-2">{t(v.descricao)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{v.exemplo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="vars-campos">
        <h2 id="vars-campos" className="text-base font-semibold">
          {t("Campos do contato")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Os campos padrão da ficha de cada contato — o valor é de cada contato, editado no Inbox, em Contatos ou pelo importador. Para dar opções a um deles (ex.: os idiomas de idioma_conversa), crie abaixo uma variável com a MESMA chave, do tipo seleção.",
          )}
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" data-testid="campos-do-catalogo">
            <tbody>
              {CAMPOS_DO_CONTATO.filter((c) => c.origem === "padrao").map((c) => (
                <tr key={c.chave} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{`{${c.chave}}`}</td>
                  <td className="px-3 py-2">{t(c.rotulo)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.dica ? t(c.dica) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="vars-org">
        <h2 id="vars-org" className="text-base font-semibold">
          {t("Da sua empresa")}
        </h2>
        {inicial.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("Nenhuma variável personalizada ainda.")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" data-testid="variaveis-da-empresa">
              <thead className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("Chave")}</th>
                  <th className="px-3 py-2">{t("Nome")}</th>
                  <th className="px-3 py-2">{t("Tipo")}</th>
                  <th className="px-3 py-2">{t("Padrão")}</th>
                  <th className="px-3 py-2">{t("No perfil")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {inicial.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0" data-testid={`variavel-${v.key}`}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{`{${v.key}}`}</td>
                    <td className="px-3 py-2">{v.label}</td>
                    <td className="px-3 py-2">
                      {t(ROTULO_DO_TIPO[v.type])}
                      {v.type === "selecao" && v.options.length > 0 ? ` (${v.options.join(", ")})` : ""}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{v.default_value ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Switch
                        checked={v.visible_in_profile}
                        disabled={!podeEditar || ocupado}
                        onCheckedChange={(c) =>
                          chamar(`/api/v1/variaveis/${v.id}`, "PATCH", { visible_in_profile: c }, "Variável salva.")
                        }
                        aria-label={t("Mostrar no perfil do contato")}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {podeEditar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("Excluir variável")}
                          disabled={ocupado}
                          onClick={() => chamar(`/api/v1/variaveis/${v.id}`, "DELETE", undefined, "Variável excluída.")}
                        >
                          <Trash size={15} aria-hidden className="text-error" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {podeEditar && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid="nova-variavel">
            <p className="text-sm font-medium">{t("Nova variável")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="var-rotulo">{t("Nome")}</Label>
                <Input id="var-rotulo" value={rotulo} maxLength={80} onChange={(e) => setRotulo(e.target.value)} placeholder={t("Ex.: Interesse principal")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="var-chave">{t("Chave (usada como {chave})")}</Label>
                <Input
                  id="var-chave"
                  value={chaveFinal}
                  maxLength={40}
                  onChange={(e) => {
                    setChaveTocada(true);
                    setChave(e.target.value.toLowerCase());
                  }}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="var-tipo">{t("Tipo")}</Label>
                <select
                  id="var-tipo"
                  className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoDeVariavel)}
                >
                  {TIPOS_DE_VARIAVEL.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(ROTULO_DO_TIPO[tp])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="var-padrao">{t("Valor padrão (opcional)")}</Label>
                <Input id="var-padrao" value={padrao} maxLength={500} onChange={(e) => setPadrao(e.target.value)} />
              </div>
              {tipo === "selecao" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="var-opcoes">{t("Opções (separe por vírgula)")}</Label>
                  <Input id="var-opcoes" value={opcoes} onChange={(e) => setOpcoes(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={noPerfil} onCheckedChange={setNoPerfil} aria-label={t("Mostrar no perfil do contato")} />
                {t("Mostrar no perfil do contato")}
              </label>
              <Button type="button" onClick={criar} disabled={ocupado || !rotulo.trim() || !chaveFinal} data-testid="criar-variavel">
                {t("Criar variável")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
