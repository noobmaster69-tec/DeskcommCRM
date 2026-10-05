"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { melhorFrenteSobre } from "@/lib/branding/contraste";
import { iniciaisDoCrm, slugDeCrm } from "@/lib/crms/crms";

/** A cor sugerida quando a pessoa liga "Personalizar cor" — o azul do tema. */
const COR_INICIAL = "#386bf8";

/**
 * O modal "+ Novo CRM".
 *
 * O endereço (slug) acompanha o nome ATÉ a pessoa mexer nele: a partir daí é
 * dela, e renomear não o sobrescreve mais. A conta do slug é a MESMA do
 * servidor (`slugDeCrm`), então o que a tela mostra é o que nasce — salvo
 * colisão, que a rota recusa com a frase dela, mostrada aqui mesmo.
 *
 * "Definir como padrão" só aparece quando já existe CRM: o primeiro nasce
 * padrão de qualquer jeito (a rota garante), e oferecer a escolha seria
 * oferecer o que não muda nada.
 */
export function NovoCrm({
  aberto,
  aoFechar,
  jaExisteCrm,
  slugsOcupados,
}: {
  aberto: boolean;
  aoFechar: () => void;
  jaExisteCrm: boolean;
  /** Slugs vivos da organização — só para a sugestão não nascer colidindo. */
  slugsOcupados: string[];
}) {
  const t = useT();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [corLigada, setCorLigada] = useState(false);
  const [cor, setCor] = useState(COR_INICIAL);
  const [padrao, setPadrao] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const slugMostrado = slugEditado ? slug : nome.trim() ? slugDeCrm(nome, slugsOcupados) : "";
  const iniciais = nome.trim() ? iniciaisDoCrm(nome) : "?";

  function limpar() {
    setNome("");
    setSlug("");
    setSlugEditado(false);
    setCorLigada(false);
    setCor(COR_INICIAL);
    setPadrao(false);
    setDescricao("");
    setErro(null);
  }

  function fechar() {
    if (enviando) return;
    limpar();
    aoFechar();
  }

  async function criar() {
    if (!nome.trim() || !slugMostrado.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      await apiClient.post("/api/v1/crms", {
        name: nome.trim(),
        slug: slugMostrado.trim(),
        description: descricao.trim() || null,
        avatar_bg_color: corLigada ? cor : null,
        ...(jaExisteCrm && padrao ? { is_default: true } : {}),
      });
      limpar();
      aoFechar();
      router.refresh();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : t("Não consegui criar o CRM. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? undefined : fechar())}>
      <DialogContent className="sm:max-w-lg" data-testid="modal-novo-crm">
        <DialogHeader>
          <DialogTitle>{t("Novo CRM")}</DialogTitle>
          <DialogDescription>
            {t("Um CRM agrupa funis com o mesmo público ou a mesma marca.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="novo-crm-nome">
              {t("Nome")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="novo-crm-nome"
              autoFocus
              value={nome}
              maxLength={80}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Ex.: Clientes Girly")}
              data-testid="novo-crm-nome"
              disabled={enviando}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="novo-crm-slug">
              {t("Endereço")} <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center rounded-md border border-border bg-surface pl-3 focus-within:ring-2 focus-within:ring-ring">
              <span className="font-mono text-sm text-muted-foreground" aria-hidden>
                /
              </span>
              <input
                id="novo-crm-slug"
                className="h-9 w-full bg-transparent px-1 font-mono text-sm outline-hidden"
                value={slugMostrado}
                maxLength={40}
                onChange={(e) => {
                  setSlugEditado(true);
                  setSlug(e.target.value.replace(/^\/+/, ""));
                }}
                placeholder="clientes-girly"
                data-testid="novo-crm-slug"
                disabled={enviando}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Letras minúsculas, números e hífen. Único na organização.")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-elevated text-sm font-semibold"
              style={corLigada ? { backgroundColor: cor, color: melhorFrenteSobre(cor), borderColor: cor } : undefined}
              aria-hidden
              data-testid="novo-crm-avatar"
            >
              {iniciais}
            </span>
            <div className="flex flex-1 items-center justify-between gap-3">
              <Label htmlFor="novo-crm-cor-ligada" className="text-sm font-normal">
                {t("Personalizar cor de fundo")}
              </Label>
              <div className="flex items-center gap-2">
                {corLigada ? (
                  <input
                    type="color"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    aria-label={t("Cor de fundo do avatar")}
                    className="h-8 w-10 cursor-pointer rounded-sm border border-border bg-transparent"
                    data-testid="novo-crm-cor"
                    disabled={enviando}
                  />
                ) : null}
                <Switch
                  id="novo-crm-cor-ligada"
                  checked={corLigada}
                  onCheckedChange={setCorLigada}
                  disabled={enviando}
                />
              </div>
            </div>
          </div>

          {jaExisteCrm ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="novo-crm-padrao">{t("Definir como padrão")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("Funil novo sem CRM escolhido entra aqui. O padrão atual deixa de ser.")}
                </p>
              </div>
              <Switch
                id="novo-crm-padrao"
                checked={padrao}
                onCheckedChange={setPadrao}
                disabled={enviando}
                data-testid="novo-crm-padrao"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="novo-crm-descricao">{t("Descrição")}</Label>
            <Textarea
              id="novo-crm-descricao"
              value={descricao}
              maxLength={280}
              rows={3}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={t("Opcional — para quem é este CRM")}
              disabled={enviando}
            />
          </div>

          {erro ? (
            <p className="text-sm text-destructive" role="alert" data-testid="novo-crm-erro">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={fechar} disabled={enviando}>
              {t("Cancelar")}
            </Button>
            <Button
              type="submit"
              disabled={enviando || !nome.trim() || !slugMostrado.trim()}
              data-testid="novo-crm-criar"
            >
              {enviando ? t("Criando…") : t("Criar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
