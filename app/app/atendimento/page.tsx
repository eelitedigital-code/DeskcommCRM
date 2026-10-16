import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Atendimento" };

/**
 * Hub do Atendimento (Spec 04, fork Elite).
 *
 * Nasceu pela mesma régua do hub do CRM: o Dashboard foi a quinta tela do
 * grupo, e o menu de 900 px não cabe mais uma linha (`tests/e2e/navegacao.spec.ts`).
 * O menu fica com o que se abre o dia inteiro (Dashboard, Inbox, Agenda);
 * Radar e Respostas rápidas moram aqui e no ⌘K — escolha do dono (opção B).
 * O hub é o inventário do grupo: as cinco telas aparecem aqui.
 */
export default async function AtendimentoHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;
  const capacidadesLigadas = activeOrg
    ? await capacidadesDaOrganizacao(createAdminClient(), activeOrg.orgId)
    : [];

  return (
    <NavHub
      group="atendimento"
      capacidadesLigadas={capacidadesLigadas}
      isPlatformAdmin={user.is_platform_admin && !user.support}
      role={activeOrg?.role ?? null}
      interfaceSettings={activeOrg?.interface_settings}
      modulosLigados={await modulosLigados(createAdminClient())}
      title={traduzir("Atendimento", idioma)}
      subtitle={traduzir("Onde a equipe atende o cliente — e o que ajuda a responder melhor.", idioma)}
      locale={idioma}
    />
  );
}
