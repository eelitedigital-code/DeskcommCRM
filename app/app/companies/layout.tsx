import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Empresas, pessoas e importação são módulo opcional da instalação, desligado
 * por padrão (doc 68). Desligado, estas telas não existem para ninguém: quem
 * liga é quem administra o servidor, em `/admin/sistema`.
 *
 * Com o módulo ligado, cada EMPRESA ainda decide se usa (capacidade `empresas`,
 * `lib/organizacao/capacidades.ts`). Desligada para esta organização, a tela
 * recusa (403) — a mesma resposta das rotas — e a porta some do menu.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "crm_b2b"))) notFound();
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  if (!(await capacidadesDaOrganizacao(admin, org.orgId)).includes("empresas")) redirect("/403");
  return children;
}
