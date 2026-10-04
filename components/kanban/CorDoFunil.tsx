import { cn } from "@/lib/utils";

/** Um funil do CRM como o seletor o mostra. */
export interface FunilDoSeletor {
  id: string;
  name: string;
  color: string | null;
  is_primary: boolean;
}

/** A bolinha da cor do funil — vazia (só o contorno) quando ele não tem cor. */
export function CorDoFunil({ cor, className }: { cor: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-border", className)}
      style={cor ? { backgroundColor: cor, borderColor: cor } : undefined}
    />
  );
}
