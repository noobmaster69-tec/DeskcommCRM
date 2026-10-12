import { phoneForDisplay } from "@/lib/channels/phone-variants";

/**
 * O número como uma pessoa escreve: "+55 19 2042-5772", "+351 912 345 678".
 *
 * Só EXIBIÇÃO. A gravação e a busca seguem no canônico de `phoneForDisplay`
 * (dígitos com o nono dígito resolvido); aqui só se agrupa o que já veio
 * canônico. País sem regra conhecida cai em "+DDI resto", que ainda é legível.
 */
export function telefoneLegivel(raw: string | null | undefined): string {
  const canonico = phoneForDisplay(raw);
  const d = canonico.replace(/\D/g, "");
  if (d.length < 8) return canonico;
  // Brasil: +55 DD XXXX-XXXX (fixo) ou +55 DD XXXXX-XXXX (celular).
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length - 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  // EUA/Canadá: +1 XXX XXX XXXX.
  if (d.startsWith("1") && d.length === 11) {
    return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }
  // Portugal, Espanha: +351/+34 XXX XXX XXX.
  for (const ddi of ["351", "34"]) {
    if (d.startsWith(ddi) && d.length === ddi.length + 9) {
      const n = d.slice(ddi.length);
      return `+${ddi} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    }
  }
  // Reino Unido: +44 XXXX XXXXXX.
  if (d.startsWith("44") && d.length === 12) return `+44 ${d.slice(2, 6)} ${d.slice(6)}`;
  // Holanda: +31 X XXXX XXXX.
  if (d.startsWith("31") && d.length === 11) return `+31 ${d.slice(2, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `+${d}`;
}
