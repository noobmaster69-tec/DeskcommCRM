/**
 * O rodapé do card de CRM: "Atualizado há 5 min", "há 3 h", "ontem", "há 4 dias".
 *
 * Puro e com o relógio injetado: a tela traduz a frase (`t(frase).replace("{n}",
 * …)`), e o teste fixa o "agora" em vez de depender do minuto em que roda.
 *
 * "Ontem" é do CALENDÁRIO, não das 24 horas: às 9h, algo de 22h da véspera é
 * "ontem" (11 h atrás), e não "há 11 h" — que é como a pessoa diria. O dia é o
 * do fuso de quem olha (`Date` local), que é o fuso em que ela lê "ontem".
 */
export type Atualizacao =
  | { frase: "Sem negócios ainda" }
  | { frase: "Atualizado agora" }
  | { frase: "Atualizado há {n} min"; n: number }
  | { frase: "Atualizado há {n} h"; n: number }
  | { frase: "Atualizado ontem" }
  | { frase: "Atualizado há {n} dias"; n: number };

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

function inicioDoDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function atualizacaoDoCrm(ultimo: string | null, agora: Date = new Date()): Atualizacao {
  if (!ultimo) return { frase: "Sem negócios ainda" };
  const quando = new Date(ultimo);
  const passou = Math.max(0, agora.getTime() - quando.getTime());

  if (passou < MINUTO) return { frase: "Atualizado agora" };

  // Dias de CALENDÁRIO entre as duas datas. `Math.round` absorve a hora a mais
  // ou a menos do dia em que muda o horário de verão.
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(quando)) / (24 * HORA));
  if (dias === 1) return { frase: "Atualizado ontem" };
  if (dias >= 2) return { frase: "Atualizado há {n} dias", n: dias };

  if (passou < HORA) return { frase: "Atualizado há {n} min", n: Math.floor(passou / MINUTO) };
  return { frase: "Atualizado há {n} h", n: Math.floor(passou / HORA) };
}
