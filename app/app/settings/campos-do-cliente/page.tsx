/**
 * Configurações → Campos do cliente. Onde a organização define os dados que
 * guarda de CADA CLIENTE — sexo, cidade, produtos de interesse — independente
 * de funil.
 *
 * Antes daqui as definições moravam no funil padrão (`crm_pipelines.settings.fields`)
 * e a ficha do contato as pegava emprestadas: com dois funis, o cadastro do
 * cliente dependia de qual deles era o padrão. Agora moram em
 * `organizations.settings.contact_fields` (`lib/contacts/campos-do-cliente.ts`).
 *
 * Gate `manager`+, o mesmo da tela de funis e o mesmo da action que grava
 * (`salvarCamposDoCliente`) — sem atalho de platform admin, para a tela e o
 * servidor dizerem a MESMA coisa (ver o comentário de `settings/tags/page.tsx`).
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { camposDoCliente } from "@/lib/contacts/campos-do-cliente";
import { traduzir } from "@/lib/i18n/dicionario";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { CamposDoClienteClient } from "./_client";

export const metadata = { title: "Campos do cliente" };
export const dynamic = "force-dynamic";

export default async function CamposDoClientePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");

  // A linha da organização pelo admin client, com o id da SESSÃO — o mesmo
  // caminho de leitura da action que grava.
  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const campos = camposDoCliente((org?.settings ?? null) as Record<string, unknown> | null);

  // Os campos dos funis entram SÓ para o aviso de colisão: a mesma chave nos
  // dois lados passa a mostrar o valor do cliente, e quem cadastra precisa
  // saber por que o campo sumiu do dossiê do negócio.
  const supabase = await createClient();
  const { data: funis } = await supabase
    .from("crm_pipelines")
    .select("name, settings")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");
  const camposDosFunis = (
    (funis ?? []) as Array<{ name: string; settings: Record<string, unknown> | null }>
  ).flatMap((f) => camposDoFunil(f.settings).map((c) => ({ chave: c.key, funil: f.name })));

  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Campos do cliente", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Aparecem na ficha do contato e no painel da conversa. Valem para todos os clientes desta empresa.",
            idioma,
          )}
        </p>
      </header>
      <CamposDoClienteClient campos={campos} camposDosFunis={camposDosFunis} />
    </div>
  );
}
