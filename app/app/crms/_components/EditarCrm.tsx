"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
import { iniciaisDoCrm } from "@/lib/crms/crms";
import { PencilSimple } from "@/lib/ui/icons";

/** O CRM como a página o tem. */
export interface CrmEditavel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_bg_color: string | null;
  is_default: boolean;
}

const COR_INICIAL = "#386bf8";

/**
 * "Editar CRM": nome, endereço, descrição, cor do avatar, tornar padrão e
 * arquivar — a tela que faltava para `PATCH`/`DELETE /api/v1/crms/[id]`.
 *
 * ⚠️ AS REGRAS SÃO DA API (`lib/crms/crms.ts`): nome e endereço únicos na
 * organização, o padrão se muda e não se apaga, arquivar o CRM leva os funis
 * junto (9009) e é recusado se um funil dele é o padrão da organização ou
 * recebe lead de formulário/automação. A recusa chega com a frase pronta e
 * aparece no modal. O que a tela decide sozinha: só mandar o que mudou, não
 * oferecer "tornar padrão" ao CRM que já é, nem "arquivar" ao padrão.
 */
/** O botão "Editar CRM" da página do CRM, com o modal. */
export function EditarCrm({ crm }: { crm: CrmEditavel }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} data-testid="editar-crm">
        <PencilSimple size={14} className="mr-1.5" aria-hidden /> {t("Editar CRM")}
      </Button>
      {aberto && <EditarCrmDialog crm={crm} onClose={() => setAberto(false)} />}
    </>
  );
}

/**
 * O modal de edição, sem botão próprio: a página do CRM e o menu "⋯" do card na
 * grade abrem o MESMO modal — duas cópias divergiriam na primeira mudança.
 *
 * `naGrade`: aberto pelo card, a tela continua na grade (troca de endereço e
 * arquivamento só releem a lista); aberto pela página, ela segue o endereço novo
 * e volta para a grade ao arquivar. `arquivando`: abre já na confirmação de
 * arquivar (o item "Arquivar CRM" do menu).
 */
export function EditarCrmDialog({
  crm,
  onClose,
  naGrade = false,
  arquivando = false,
}: {
  crm: CrmEditavel;
  onClose: () => void;
  naGrade?: boolean;
  arquivando?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const aberto = true;
  const setAberto = (v: boolean) => {
    if (!v) onClose();
  };
  const [nome, setNome] = useState(crm.name);
  const [slug, setSlug] = useState(crm.slug);
  const [descricao, setDescricao] = useState(crm.description ?? "");
  const [corLigada, setCorLigada] = useState(crm.avatar_bg_color !== null);
  const [cor, setCor] = useState(crm.avatar_bg_color ?? COR_INICIAL);
  const [padrao, setPadrao] = useState(false);
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(arquivando && !crm.is_default);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function recusa(e: unknown): string {
    return e instanceof ApiError && (e.status === 409 || e.status === 422)
      ? t(e.message)
      : t("Não deu para salvar agora. Tente de novo em instantes.");
  }

  async function salvar() {
    // SÓ O QUE MUDOU VIAJA: mandar o slug igual faria a API validar uma troca
    // de endereço que ninguém pediu.
    const corpo: Record<string, unknown> = {};
    if (nome.trim() !== crm.name) corpo.name = nome.trim();
    if (slug.trim().replace(/^\/+/, "") !== crm.slug) corpo.slug = slug.trim().replace(/^\/+/, "");
    if ((descricao.trim() || null) !== crm.description) corpo.description = descricao.trim() || null;
    const corFinal = corLigada ? cor : null;
    if (corFinal !== crm.avatar_bg_color) corpo.avatar_bg_color = corFinal;
    if (padrao) corpo.is_default = true;
    if (Object.keys(corpo).length === 0) {
      setAberto(false);
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await apiClient.patch<{ data: { slug: string } }>(`/api/v1/crms/${crm.id}`, corpo);
      toast.success(t("CRM atualizado."));
      setAberto(false);
      // O endereço é a URL da página do CRM: mudou, a página muda junto. Na
      // grade, só relê a lista.
      if (!naGrade && r.data.slug !== crm.slug) router.push(`/app/crms/${r.data.slug}`);
      else router.refresh();
    } catch (e) {
      setErro(recusa(e));
    } finally {
      setEnviando(false);
    }
  }

  async function arquivar() {
    setEnviando(true);
    setErro(null);
    try {
      await apiClient.delete(`/api/v1/crms/${crm.id}`);
      toast.success(`«${crm.name}» ${t("foi arquivado.")}`);
      setAberto(false);
      if (naGrade) router.refresh();
      else router.push("/app/crms");
    } catch (e) {
      setErro(recusa(e));
      setConfirmandoArquivo(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => (v ? undefined : setAberto(false))}>
        <DialogContent className="sm:max-w-lg" data-testid="modal-editar-crm">
          <DialogHeader>
            <DialogTitle>{t("Editar CRM")}</DialogTitle>
            <DialogDescription>{t("Nome, endereço, descrição e cor deste CRM.")}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="editar-crm-nome">
                {t("Nome")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="editar-crm-nome"
                value={nome}
                maxLength={80}
                onChange={(e) => setNome(e.target.value)}
                data-testid="editar-crm-nome"
                disabled={enviando}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editar-crm-slug">
                {t("Endereço")} <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center rounded-md border border-border bg-surface pl-3 focus-within:ring-2 focus-within:ring-ring">
                <span className="font-mono text-sm text-muted-foreground" aria-hidden>
                  /
                </span>
                <input
                  id="editar-crm-slug"
                  className="h-9 w-full bg-transparent px-1 font-mono text-sm outline-hidden"
                  value={slug}
                  maxLength={40}
                  onChange={(e) => setSlug(e.target.value.replace(/^\/+/, ""))}
                  data-testid="editar-crm-slug"
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
              >
                {iniciaisDoCrm(nome || crm.name)}
              </span>
              <div className="flex flex-1 items-center justify-between gap-3">
                <Label htmlFor="editar-crm-cor-ligada" className="text-sm font-normal">
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
                      disabled={enviando}
                    />
                  ) : null}
                  <Switch id="editar-crm-cor-ligada" checked={corLigada} onCheckedChange={setCorLigada} disabled={enviando} />
                </div>
              </div>
            </div>

            {!crm.is_default && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <Label htmlFor="editar-crm-padrao">{t("Definir como padrão")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Funil novo sem CRM escolhido entra aqui. O padrão atual deixa de ser.")}
                  </p>
                </div>
                <Switch
                  id="editar-crm-padrao"
                  checked={padrao}
                  onCheckedChange={setPadrao}
                  disabled={enviando}
                  data-testid="editar-crm-padrao"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="editar-crm-descricao">{t("Descrição")}</Label>
              <Textarea
                id="editar-crm-descricao"
                value={descricao}
                maxLength={280}
                rows={3}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder={t("Opcional — para quem é este CRM")}
                disabled={enviando}
              />
            </div>

            {erro ? (
              <p className="text-sm text-destructive" role="alert" data-testid="editar-crm-erro">
                {erro}
              </p>
            ) : null}

            {confirmandoArquivo && (
              <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="editar-crm-confirmar-arquivo">
                <p>
                  {t("Arquivar o CRM arquiva também os funis dele. Os negócios ficam no histórico, e os números de WhatsApp ligados a ele voltam para o CRM padrão.")}
                </p>
                <Button type="button" variant="destructive" size="sm" onClick={() => void arquivar()} disabled={enviando} data-testid="editar-crm-arquivar-sim">
                  {t("Arquivar CRM")}
                </Button>
              </div>
            )}

            <DialogFooter className="gap-2 sm:justify-between">
              {!crm.is_default ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmandoArquivo(true)}
                  disabled={enviando}
                  data-testid="editar-crm-arquivar"
                >
                  {t("Arquivar CRM")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
                  {t("Cancelar")}
                </Button>
                <Button type="submit" disabled={enviando || !nome.trim() || !slug.trim()} data-testid="editar-crm-salvar">
                  {t("Salvar")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
