"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GRUPO_NO_RODAPE, sidebarGroups } from "@/lib/navigation/registry";
import { chaveDeGrupo, chaveDoMenuOculto } from "@/lib/navigation/menu-pessoal";
import { cn } from "@/lib/utils";

/**
 * Configurações › Aparência › Menu lateral (fork jhoow, P6).
 *
 * A lista é a MESMA projeção do menu (`sidebarGroups`), então só aparece aqui o
 * que a pessoa já pode ver — papel, módulos, empresa e admin decidiram antes.
 * Desligar um grupo esconde todos os itens dele de uma vez; os itens continuam
 * com a própria escolha guardada, e voltam como estavam quando o grupo volta.
 *
 * Grava no servidor (por pessoa e organização) e espelha no navegador, que é o
 * fallback do menu se o servidor não trouxer a preferência.
 */
export function MenuLateralForm() {
  const t = useT();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [salvando, startTransition] = useTransition();
  const grupos = useMemo(
    () =>
      sidebarGroups(
        user.is_platform_admin && !user.support,
        activeOrg?.role ?? null,
        activeOrg?.interface_settings,
        activeOrg?.modulos_ligados ?? [],
        activeOrg?.capacidades_ligadas ?? [],
      ).filter((g) => g.group.id !== GRUPO_NO_RODAPE),
    [user.is_platform_admin, user.support, activeOrg],
  );
  const gravado = useMemo(() => new Set(activeOrg?.menu_oculto ?? []), [activeOrg?.menu_oculto]);
  const [oculto, setOculto] = useState<Set<string>>(gravado);
  const mudou = oculto.size !== gravado.size || [...oculto].some((x) => !gravado.has(x));

  function alternar(chave: string, visivel: boolean) {
    setOculto((atual) => {
      const novo = new Set(atual);
      if (visivel) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function salvar() {
    const menu_oculto = [...oculto];
    try {
      window.localStorage.setItem(
        chaveDoMenuOculto(user.id, activeOrg?.orgId ?? null),
        JSON.stringify(menu_oculto),
      );
    } catch {
      // Storage bloqueado: o servidor continua sendo a fonte.
    }
    startTransition(async () => {
      const resp = await fetch("/api/v1/me/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu_oculto }),
      }).catch(() => null);
      if (!resp?.ok) {
        toast.error(t("Não foi possível salvar o menu."));
        return;
      }
      toast.success(t("Menu atualizado."));
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <div>
        <h2 className="text-base font-semibold">{t("Menu lateral")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Desligue o que você não usa. Esconder do menu não tira o acesso: a tela continua na busca (⌘K).")}
        </p>
      </div>
      <div className="space-y-4">
        {grupos.map(({ group, items }) => {
          const grupoVisivel = !oculto.has(chaveDeGrupo(group.id));
          const idDoGrupo = `menu-grupo-${group.id}`;
          return (
            <section key={group.id} className="rounded-md border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <label htmlFor={idDoGrupo} className="text-sm font-semibold">
                  {t(group.label)}
                </label>
                <Switch
                  id={idDoGrupo}
                  checked={grupoVisivel}
                  onCheckedChange={(v) => alternar(chaveDeGrupo(group.id), v)}
                  aria-label={`${t("Mostrar o grupo")} ${t(group.label)}`}
                />
              </div>
              <ul className={cn("divide-y divide-border", !grupoVisivel && "opacity-50")}>
                {items.map((item) => {
                  const Icon = item.icon;
                  const id = `menu-item-${item.href}`;
                  return (
                    <li key={item.href} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm">
                        <Icon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                        <span className="truncate">{t(item.label)}</span>
                      </label>
                      <Switch
                        id={id}
                        checked={!oculto.has(item.href)}
                        disabled={!grupoVisivel}
                        onCheckedChange={(v) => alternar(item.href, v)}
                        aria-label={`${t("Mostrar")} ${t(item.label)}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={salvar} disabled={!mudou || salvando}>
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
        {oculto.size > 0 && (
          <Button type="button" variant="ghost" onClick={() => setOculto(new Set())} disabled={salvando}>
            {t("Mostrar tudo")}
          </Button>
        )}
      </div>
    </Card>
  );
}
