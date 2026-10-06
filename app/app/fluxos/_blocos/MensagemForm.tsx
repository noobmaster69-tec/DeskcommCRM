"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DIGITANDO_MAX,
  DIGITANDO_MIN,
  DIGITANDO_PADRAO,
  mensagemConfigSchema,
  type ItemDaMensagem,
  type TipoComDigitando,
} from "@/lib/followup/blocos-do-fluxo";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import {
  CaretDown,
  CaretUp,
  ChatText,
  CircleNotch,
  FileText,
  IdentificationCard,
  ImageSquare,
  Microphone,
  MonitorPlay,
  Smiley,
  Timer,
  Trash,
  UploadSimple,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { ConfigOf } from "@/app/app/ai/followups/[id]/_components/forms/shared";
import { CampoDeTexto } from "./CampoDeTexto";
import { useCamposDaFicha } from "./useCamposDaFicha";

/**
 * Bloco Mensagem (fork jhoow, Fase B): uma SEQUÊNCIA de itens enviados em ordem —
 * texto, imagem, vídeo, áudio, arquivo, figurinha, contato — com Intervalos
 * entre eles ("digitando…"/"gravando…" enquanto espera). A mídia sobe para o
 * Storage do fluxo (`POST /api/v1/fluxos/:id/midia`, mesma validação do Inbox;
 * áudio vira nota de voz OGG/OPUS) ou aponta para um link https.
 *
 * Como os outros formulários do painel: o nó só recebe a config que passa no
 * schema; o item pela metade (mídia ainda não escolhida) fica só aqui.
 */
type Tipo = ItemDaMensagem["tipo"];
type ItemDeMidia = Extract<ItemDaMensagem, { midia: unknown }>;

const ROTULO_DO_TIPO: Record<Tipo, string> = {
  texto: "Texto",
  imagem: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  arquivo: "Arquivo",
  sticker: "Figurinha",
  contato: "Contato",
  intervalo: "Intervalo",
};

const TIPOS: ReadonlyArray<{ tipo: Tipo; Icone: typeof ChatText; aceita?: string }> = [
  { tipo: "texto", Icone: ChatText },
  { tipo: "imagem", Icone: ImageSquare, aceita: "image/*" },
  { tipo: "video", Icone: MonitorPlay, aceita: "video/*" },
  { tipo: "audio", Icone: Microphone, aceita: "audio/*" },
  { tipo: "arquivo", Icone: FileText, aceita: "*/*" },
  { tipo: "sticker", Icone: Smiley, aceita: "image/webp" },
  { tipo: "contato", Icone: IdentificationCard },
  { tipo: "intervalo", Icone: Timer },
];

/** Item em edição: a mídia pode ainda não existir (o schema a exige). */
type Rascunho = ItemDaMensagem | (Omit<ItemDeMidia, "midia"> & { midia: ItemDeMidia["midia"] | null });

function novoId(itens: readonly Rascunho[]): string {
  let n = itens.length + 1;
  while (itens.some((i) => i.id === `i${n}`)) n++;
  return `i${n}`;
}

function itemNovo(tipo: Tipo, id: string): Rascunho {
  switch (tipo) {
    case "texto":
      return { id, tipo, texto: "", typing_delay_seconds: DIGITANDO_PADRAO.texto };
    case "contato":
      return { id, tipo, nome: "", telefone: "" };
    case "intervalo":
      return { id, tipo, modo: "fixo", segundos: 3 };
    default:
      return { id, tipo, midia: null, typing_delay_seconds: DIGITANDO_PADRAO[tipo as TipoComDigitando] } as Rascunho;
  }
}

type ItemComDigitando = Extract<Rascunho, { tipo: TipoComDigitando }>;

/**
 * "Delay do digitando" (fork jhoow): quanto tempo o WhatsApp fica digitando
 * (gravando, no áudio) antes de enviar ESTE item. Opcional: tempo aleatório
 * entre o mínimo (o slider) e um máximo.
 */
function EditorDoDigitando({ item, onChange }: { item: ItemComDigitando; onChange: (i: Rascunho) => void }) {
  const t = useT();
  const segundos = item.typing_delay_seconds ?? DIGITANDO_PADRAO[item.tipo];
  const max = item.typing_delay_random_max ?? null;
  const aleatorio = max !== null;
  return (
    <div className="space-y-2 border-t border-border pt-2" data-testid={`digitando-${item.id}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-text-muted">{t("Delay do “digitando”")}</span>
        <span className="text-sm font-semibold text-text" data-testid={`digitando-valor-${item.id}`}>
          {aleatorio ? `${segundos}–${max}` : segundos} {t("segundos")}
        </span>
        <span className="text-text-muted">
          {DIGITANDO_MAX} {t("segundos")}
        </span>
      </div>
      <Slider
        aria-label={t("Delay do “digitando”")}
        min={DIGITANDO_MIN}
        max={DIGITANDO_MAX}
        value={[segundos]}
        onValueChange={([v]) =>
          onChange({
            ...item,
            typing_delay_seconds: v,
            ...(aleatorio && max !== null && max < (v ?? 1) ? { typing_delay_random_max: v } : {}),
          } as Rascunho)
        }
      />
      <p className="text-[11px] text-text-muted">
        {item.tipo === "audio"
          ? t("Tempo que o WhatsApp ficará “gravando áudio” antes de enviar esta mensagem.")
          : t("Tempo que o WhatsApp ficará “digitando” antes de enviar esta mensagem.")}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Switch
          id={`aleatorio-${item.id}`}
          checked={aleatorio}
          onCheckedChange={(on) =>
            onChange({ ...item, typing_delay_seconds: segundos, typing_delay_random_max: on ? Math.min(DIGITANDO_MAX, segundos + 4) : null } as Rascunho)
          }
        />
        <label htmlFor={`aleatorio-${item.id}`} className="text-text-muted">
          {t("Tempo aleatório")}
        </label>
        {aleatorio && (
          <span className="flex items-center gap-1">
            {t("de")} {segundos} {t("até")}
            <Input
              type="number"
              className="h-7 w-16"
              aria-label={t("Máximo do digitando (segundos)")}
              min={segundos}
              max={DIGITANDO_MAX}
              value={max ?? segundos}
              onChange={(e) =>
                onChange({
                  ...item,
                  typing_delay_random_max: Math.max(segundos, Math.min(DIGITANDO_MAX, Math.round(Number(e.target.value) || segundos))),
                } as Rascunho)
              }
            />
            {t("segundos")}
          </span>
        )}
      </div>
    </div>
  );
}

export function MensagemForm({
  config,
  onChange,
  flowId,
}: {
  config: ConfigOf<"mensagem">;
  onChange: (c: ConfigOf<"mensagem">) => void;
  flowId?: string;
}) {
  const t = useT();
  const { variaveis } = useCamposDaFicha();
  const [itens, setItens] = useState<Rascunho[]>(config.itens);
  const [erro, setErro] = useState<string | null>(null);

  function gravar(next: Rascunho[]) {
    setItens(next);
    const r = mensagemConfigSchema.safeParse({ itens: next });
    if (!r.success) {
      const i = r.error.issues[0]?.path[1];
      const pos = typeof i === "number" ? `${t("Item")} ${i + 1}: ` : "";
      setErro(next.length === 0 ? t("Adicione ao menos um item.") : `${pos}${t("complete o item para salvar.")}`);
      return;
    }
    setErro(null);
    onChange(r.data);
  }

  const trocar = (idx: number, item: Rascunho) => gravar(itens.map((x, i) => (i === idx ? item : x)));
  const mover = (idx: number, d: -1 | 1) => {
    const next = [...itens];
    const [it] = next.splice(idx, 1);
    next.splice(idx + d, 0, it!);
    gravar(next);
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2" aria-label={t("Itens da mensagem")}>
        {itens.map((item, idx) => {
          const meta = TIPOS.find((x) => x.tipo === item.tipo)!;
          return (
            <li key={item.id} className="rounded-md border border-border bg-surface p-2" data-testid={`item-${item.tipo}`}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-muted">
                <meta.Icone size={14} aria-hidden />
                <span className="flex-1">
                  {idx + 1}. {t(ROTULO_DO_TIPO[item.tipo])}
                </span>
                <button
                  type="button"
                  className="rounded-sm p-1 hover:bg-surface-elevated disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={() => mover(idx, -1)}
                  aria-label={t("Subir item")}
                >
                  <CaretUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-sm p-1 hover:bg-surface-elevated disabled:opacity-30"
                  disabled={idx === itens.length - 1}
                  onClick={() => mover(idx, 1)}
                  aria-label={t("Descer item")}
                >
                  <CaretDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-sm p-1 text-error-fg hover:bg-surface-elevated"
                  onClick={() => gravar(itens.filter((_, i) => i !== idx))}
                  aria-label={t("Remover item")}
                >
                  <Trash size={12} aria-hidden />
                </button>
              </div>
              <EditorDoItem item={item} onChange={(it) => trocar(idx, it)} variaveis={variaveis} flowId={flowId} aceita={meta.aceita} />
              {item.tipo in DIGITANDO_PADRAO && (
                <EditorDoDigitando item={item as ItemComDigitando} onChange={(it) => trocar(idx, it)} />
              )}
            </li>
          );
        })}
      </ol>

      <div>
        <p className="mb-1.5 text-xs text-text-muted">{t("Adicionar à sequência")}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {TIPOS.map(({ tipo, Icone }) => (
            <button
              key={tipo}
              type="button"
              disabled={itens.length >= 30}
              onClick={() => gravar([...itens, itemNovo(tipo, novoId(itens))])}
              className="flex flex-col items-center gap-1 rounded-md border border-border px-1 py-2 text-[11px] text-text-muted hover:border-accent hover:text-text disabled:opacity-40"
            >
              <Icone size={16} aria-hidden />
              {t(ROTULO_DO_TIPO[tipo])}
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="text-xs text-error-fg">{erro}</p>}
    </div>
  );
}

function EditorDoItem({
  item,
  onChange,
  variaveis,
  flowId,
  aceita,
}: {
  item: Rascunho;
  onChange: (i: Rascunho) => void;
  variaveis: readonly string[];
  flowId: string | undefined;
  aceita: string | undefined;
}) {
  const t = useT();
  switch (item.tipo) {
    case "texto":
      return (
        <CampoDeTexto
          rotulo={t("Texto")}
          valor={item.texto}
          onChange={(texto) => onChange({ ...item, texto })}
          variaveis={variaveis}
          placeholder={t("Olá, {nome}!")}
        />
      );
    case "contato":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label={t("Nome do contato")}
            placeholder={t("Nome")}
            value={item.nome}
            maxLength={120}
            onChange={(e) => onChange({ ...item, nome: e.target.value })}
          />
          <Input
            aria-label={t("Telefone com DDI")}
            placeholder="5511999999999"
            inputMode="numeric"
            value={item.telefone}
            onChange={(e) => onChange({ ...item, telefone: e.target.value.replace(/[^\d+]/g, "") })}
          />
        </div>
      );
    case "intervalo":
      return <EditorDoIntervalo item={item} onChange={onChange} />;
    default:
      return <EditorDaMidia item={item as Extract<Rascunho, { midia: unknown }>} onChange={onChange} flowId={flowId} aceita={aceita} variaveis={variaveis} />;
  }
}

function EditorDoIntervalo({
  item,
  onChange,
}: {
  item: Extract<ItemDaMensagem, { tipo: "intervalo" }>;
  onChange: (i: Rascunho) => void;
}) {
  const t = useT();
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs">
        {(["fixo", "aleatorio"] as const).map((modo) => (
          <button
            key={modo}
            type="button"
            aria-pressed={item.modo === modo}
            className={cn(
              "rounded-full border px-2.5 py-0.5",
              item.modo === modo ? "border-accent bg-accent-soft text-accent-text" : "border-border text-text-muted",
            )}
            onClick={() =>
              onChange(
                modo === "fixo"
                  ? { id: item.id, tipo: "intervalo", modo, segundos: item.modo === "fixo" ? item.segundos : item.min_segundos }
                  : {
                      id: item.id,
                      tipo: "intervalo",
                      modo,
                      min_segundos: item.modo === "fixo" ? item.segundos : item.min_segundos,
                      max_segundos: item.modo === "fixo" ? item.segundos + 3 : item.max_segundos,
                    },
              )
            }
          >
            {modo === "fixo" ? t("Fixo") : t("Aleatório")}
          </button>
        ))}
      </div>
      {item.modo === "fixo" ? (
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Input
            type="number"
            min={1}
            max={300}
            className="w-20"
            value={item.segundos}
            onChange={(e) => onChange({ ...item, segundos: num(e.target.value) })}
          />
          {t("segundos")}
        </Label>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="number"
            min={1}
            max={300}
            className="w-20"
            aria-label={t("Mínimo (segundos)")}
            value={item.min_segundos}
            onChange={(e) => onChange({ ...item, min_segundos: num(e.target.value) })}
          />
          {t("a")}
          <Input
            type="number"
            min={1}
            max={300}
            className="w-20"
            aria-label={t("Máximo (segundos)")}
            value={item.max_segundos}
            onChange={(e) => onChange({ ...item, max_segundos: num(e.target.value) })}
          />
          {t("segundos")}
        </div>
      )}
      <p className="text-xs text-text-muted">{t("O contato vê \"digitando…\" (ou \"gravando…\" antes de áudio) enquanto espera. Até 300 segundos.")}</p>
    </div>
  );
}

function EditorDaMidia({
  item,
  onChange,
  flowId,
  aceita,
  variaveis,
}: {
  item: Extract<Rascunho, { midia: unknown }>;
  onChange: (i: Rascunho) => void;
  flowId: string | undefined;
  aceita: string | undefined;
  variaveis: readonly string[];
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [link, setLink] = useState(item.midia?.url ?? "");

  async function subir(file: File) {
    if (!flowId) return;
    setSubindo(true);
    setFalha(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(`/api/v1/fluxos/${flowId}/midia`, { method: "POST", body: form });
      const json = (await resp.json().catch(() => null)) as
        | { data?: { storage_path: string; mime: string; nome_arquivo: string | null }; error?: { message?: string } }
        | null;
      if (!resp.ok || !json?.data) {
        setFalha(json?.error?.message ?? t("Não foi possível enviar o arquivo."));
        return;
      }
      setLink("");
      onChange({
        ...item,
        midia: {
          storage_path: json.data.storage_path,
          mime: json.data.mime,
          ...(json.data.nome_arquivo ? { nome_arquivo: json.data.nome_arquivo.slice(0, 200) } : {}),
        },
      } as Rascunho);
    } finally {
      setSubindo(false);
    }
  }

  const temLegenda = item.tipo === "imagem" || item.tipo === "video";
  const nome = item.midia?.storage_path ? (item.midia.nome_arquivo ?? t("Arquivo enviado")) : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={subindo || !flowId} onClick={() => input.current?.click()}>
          {subindo ? <CircleNotch size={14} className="mr-1 animate-spin" aria-hidden /> : <UploadSimple size={14} className="mr-1" aria-hidden />}
          {nome ? t("Trocar arquivo") : t("Enviar arquivo")}
        </Button>
        {nome && <span className="truncate text-xs text-text-muted" title={nome}>{nome}</span>}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept={aceita}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void subir(f);
          }}
        />
      </div>
      <Input
        aria-label={t("Ou cole um link https")}
        placeholder={t("Ou cole um link https://…")}
        value={link}
        onChange={(e) => {
          const url = e.target.value.trim();
          setLink(e.target.value);
          onChange({ ...item, midia: url ? { url } : null } as Rascunho);
        }}
      />
      {temLegenda && (
        <CampoDeTexto
          rotulo={t("Legenda")}
          valor={("legenda" in item && item.legenda) || ""}
          onChange={(legenda) => onChange({ ...item, ...(legenda ? { legenda } : { legenda: undefined }) } as Rascunho)}
          variaveis={variaveis}
          placeholder={t("Legenda (opcional)")}
          linhas={2}
        />
      )}
      {item.tipo === "audio" && <p className="text-xs text-text-muted">{t("O áudio chega como nota de voz (gravado na hora).")}</p>}
      {falha && <p className="text-xs text-error-fg">{falha}</p>}
    </div>
  );
}
