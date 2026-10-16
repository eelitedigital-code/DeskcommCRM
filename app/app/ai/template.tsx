import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { iaDaEmpresaLigada } from "@/lib/organizacao/ia-da-empresa";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O que continua aberto com a IA DESLIGADA na empresa (Especificação 03, L1.4):
 * o hub, os Alertas (a Central de avisos mostra também avisos que não são de IA,
 * como os de etapa do funil e de conexão) e os Follow-ups (que mandam mensagem
 * pronta, sem IA). Todo o resto de `/app/ai/*` recusa — a mesma lista que some
 * do menu (`capacidade: "ia"` em `lib/navigation/catalogo.ts`).
 */
const ABERTOS_SEM_IA = ["/app/ai/inbox", "/app/ai/followups"];

function abertoSemIa(pathname: string): boolean {
  if (pathname === "/app/ai" || pathname === "/app/ai/") return true;
  return ABERTOS_SEM_IA.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Template, e não layout: o layout de uma seção NÃO roda de novo ao navegar
 * entre telas irmãs (de Alertas para Agentes, por exemplo), e a checagem
 * ficaria para trás. O template roda a cada navegação.
 */
export default async function AiTemplate({ children }: { children: React.ReactNode }) {
  // `x-pathname` é posto pelo `proxy.ts` em toda requisição.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !abertoSemIa(pathname)) {
    const user = await requireAuth();
    const org = await resolveActiveOrg(user);
    if (org && !(await iaDaEmpresaLigada(createAdminClient(), org.orgId))) redirect("/403");
  }
  return children;
}
