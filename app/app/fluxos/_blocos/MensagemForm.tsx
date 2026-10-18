"use client";

import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  ChevronUp,
  Contact,
  File,
  GripVertical,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Sticker,
  Text,
  Timer,
  Trash2,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";
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

/** Rótulo do card "Adicionar conteúdo". */
const ROTULO_DO_TIPO: Record<Tipo, string> = {
  texto: "Texto",
  imagem: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  arquivo: "Arquivo",
  sticker: "Sticker",
  contato: "Contato",
  intervalo: "Intervalo",
};

/** Nome no cabeçalho do item da sequência. */
const NOME_DO_ITEM: Record<Tipo, string> = { ...ROTULO_DO_TIPO, texto: "Mensagem de texto" };

/** Na ordem da grade "Adicionar conteúdo", cada um com a sua matiz. */
const TIPOS: ReadonlyArray<{ tipo: Tipo; Icone: LucideIcon; hue: number; aceita?: string }> = [
  { tipo: "texto", Icone: Text, hue: 262 },
  { tipo: "imagem", Icone: ImageIcon, hue: 150, aceita: "image/*" },
  { tipo: "video", Icone: Video, hue: 300, aceita: "video/*" },
  { tipo: "audio", Icone: Mic, hue: 40, aceita: "audio/*" },
  { tipo: "intervalo", Icone: Timer, hue: 215 },
  { tipo: "contato", Icone: Contact, hue: 350 },
  { tipo: "arquivo", Icone: File, hue: 275, aceita: "*/*" },
  { tipo: "sticker", Icone: Sticker, hue: 75, aceita: "image/webp" },
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
    <div className="space-y-2.5" data-testid={`digitando-${item.id}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2">
        <span className="text-[13px] text-[var(--fx-text-2)]">{t("Delay do “digitando”")}</span>
        <span className="text-[14px] font-semibold text-[var(--fx-text)]" data-testid={`digitando-valor-${item.id}`}>
          {aleatorio ? `${segundos}–${max}` : segundos} {t("segundos")}
        </span>
        <span className="text-right text-[12px] text-[var(--fx-muted)]">
          {t("máx.")} {DIGITANDO_MAX} s
        </span>
      </div>
      <Slider
        aria-label={t("Delay do “digitando”")}
        // Trilho #26262b, parte preenchida --accent (a bolinha vem do CSS do editor).
        style={{
          background: `linear-gradient(to right, #3d72ff ${((segundos - DIGITANDO_MIN) / (DIGITANDO_MAX - DIGITANDO_MIN)) * 100}%, #26262b ${((segundos - DIGITANDO_MIN) / (DIGITANDO_MAX - DIGITANDO_MIN)) * 100}%)`,
        }}
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
      <p className="text-[12px] text-[var(--fx-muted)]">
        {item.tipo === "audio"
          ? t("Tempo que o WhatsApp ficará “gravando áudio” antes de enviar esta mensagem.")
          : t("Tempo que o WhatsApp ficará “digitando” antes de enviar esta mensagem.")}
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--fx-modal-line)] pt-3 text-[12px]">
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

  const lista = useRef<HTMLOListElement>(null);
  const rolarPara = useRef<string | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);

  // "Adicionar conteúdo" rola até o card novo, depois que ele está na tela.
  useEffect(() => {
    if (!rolarPara.current) return;
    lista.current
      ?.querySelector(`[data-item-id="${rolarPara.current}"]`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    rolarPara.current = null;
  }, [itens]);

  const adicionar = (tipo: Tipo) => {
    const id = novoId(itens);
    rolarPara.current = id;
    gravar([...itens, itemNovo(tipo, id)]);
  };

  const soltarEm = (destino: number) => {
    if (arrastando === null || arrastando === destino) return;
    const next = [...itens];
    const [it] = next.splice(arrastando, 1);
    next.splice(destino, 0, it!);
    setArrastando(null);
    gravar(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <ol ref={lista} className="flex flex-col gap-3" aria-label={t("Itens da mensagem")}>
        {itens.map((item, idx) => {
          const meta = TIPOS.find((x) => x.tipo === item.tipo)!;
          return (
            <li
              key={item.id}
              className="fx-item"
              data-item-id={item.id}
              data-testid={`item-${item.tipo}`}
              onDragOver={(e) => arrastando !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                soltarEm(idx);
              }}
            >
              <div className="fx-item__head">
                <span className="fx-item__num">{idx + 1}</span>
                <meta.Icone size={15} aria-hidden className="text-[var(--c-light)]" />
                <span className="fx-item__nome">{t(NOME_DO_ITEM[item.tipo])}</span>
                <button
                  type="button"
                  className="fx-item__btn"
                  disabled={idx === 0}
                  onClick={() => mover(idx, -1)}
                  aria-label={t("Subir item")}
                >
                  <ChevronUp size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="fx-item__btn"
                  disabled={idx === itens.length - 1}
                  onClick={() => mover(idx, 1)}
                  aria-label={t("Descer item")}
                >
                  <ChevronDown size={15} aria-hidden />
                </button>
                <span
                  className="fx-item__btn fx-item__grip"
                  draggable
                  onDragStart={(e) => {
                    setArrastando(idx);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => setArrastando(null)}
                  aria-label={t("Arrastar para reordenar")}
                  title={t("Arrastar para reordenar")}
                >
                  <GripVertical size={15} aria-hidden />
                </span>
                <button
                  type="button"
                  className="fx-item__btn"
                  data-perigo="true"
                  onClick={() => gravar(itens.filter((_, i) => i !== idx))}
                  aria-label={t("Remover item")}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              <div className="fx-item__body">
                <EditorDoItem item={item} onChange={(it) => trocar(idx, it)} variaveis={variaveis} flowId={flowId} aceita={meta.aceita} />
                {item.tipo in DIGITANDO_PADRAO && (
                  <EditorDoDigitando item={item as ItemComDigitando} onChange={(it) => trocar(idx, it)} />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <p className="mb-2.5 text-[14px] font-semibold text-[var(--fx-text)]">{t("Adicionar conteúdo")}</p>
        <div className="fx-add">
          {TIPOS.map(({ tipo, Icone, hue }) => (
            <button
              key={tipo}
              type="button"
              className="fx-add__card"
              disabled={itens.length >= 30}
              onClick={() => adicionar(tipo)}
              data-testid={`adicionar-${tipo}`}
            >
              <span className="fx-add__circ" style={{ background: `oklch(0.66 0.155 ${hue} / .2)`, color: `oklch(0.85 0.1 ${hue})` }}>
                <Icone size={17} aria-hidden />
              </span>
              {t(ROTULO_DO_TIPO[tipo])}
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="text-[12px] text-[#fca5a5]">{erro}</p>}
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
        <div className="space-y-2">
          <p className="text-[13px] text-[var(--fx-text-2)]">{t("Conteúdo da mensagem")} *</p>
          <CampoDeTexto
            rotulo={t("Conteúdo da mensagem")}
            valor={item.texto}
            onChange={(texto) => onChange({ ...item, texto })}
            variaveis={variaveis}
            placeholder={t("Olá, {nome}!")}
          />
        </div>
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
          {subindo ? <LoaderCircle size={14} className="mr-1 animate-spin" aria-hidden /> : <Upload size={14} className="mr-1" aria-hidden />}
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
