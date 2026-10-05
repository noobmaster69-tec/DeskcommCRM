"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** O XYFlow fica fora do bundle do servidor (mesmo motivo do FlowBuilder). */
export const FluxoSomenteLeituraDinamico = dynamic(
  () => import("./FluxoSomenteLeitura").then((m) => m.FluxoSomenteLeitura),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);
