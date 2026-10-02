import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { MenuLateralForm } from "./_menu-lateral";

export const dynamic = "force-dynamic";

/** Configurações › Aparência (fork jhoow, P6). */
export default async function AparenciaPage() {
  const user = await requireAuth();
  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Aparência", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir("Escolha quais telas e grupos aparecem no seu menu lateral.", idioma)}
        </p>
      </header>
      <MenuLateralForm />
    </div>
  );
}
