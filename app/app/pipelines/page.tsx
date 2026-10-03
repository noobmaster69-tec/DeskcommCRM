import { redirect } from "next/navigation";

/**
 * `/app/pipelines` sozinho nunca foi tela — o quadro é `/app/pipelines/[id]`.
 * Quem digita o endereço, ou chega por link antigo, cai na grade de CRMs, que é
 * de onde se abre qualquer funil.
 */
export default function PipelinesSemFunil() {
  redirect("/app/crms");
}
