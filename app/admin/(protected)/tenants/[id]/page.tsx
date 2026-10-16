import { z } from "zod";

import {
  CardDeCobranca,
  type AssinaturaDoCard,
  type PlanoDoCard,
} from "@/components/admin/tenants/CardDeCobranca";
import { CardDeEmpresas } from "@/components/admin/tenants/CardDeEmpresas";
import { CardDeIa } from "@/components/admin/tenants/CardDeIa";
import { iaLigadaNaEmpresa } from "@/lib/organizacao/ia-da-empresa";
import { moduloLigado, modulosLigados } from "@/lib/instalacao/modulos";
import { capacidadesLigadas } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

import { TenantOverviewClient } from "./_client";

interface TenantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const { id } = await params;
  const [cobranca, empresas, ia] = await Promise.all([
    lerCobrancaDoTenant(id),
    lerEmpresasDoTenant(id),
    lerIaDoTenant(id),
  ]);
  return (
    <div className="space-y-6">
      <TenantOverviewClient id={id} cobrancaLigada={cobranca !== null} />
      {cobranca && <CardDeCobranca orgId={id} {...cobranca} />}
      {empresas && <CardDeEmpresas orgId={id} ligadoInicial={empresas.ligado} />}
      {ia && <CardDeIa orgId={id} ligadoInicial={ia.ligado} />}
    </div>
  );
}

/**
 * O card Cobrança (spec da cobrança §9). `null` = a chave está desligada: a
 * página fica como sempre foi. Leitura que falha LANÇA: o card não mostra
 * "isenta" de uma empresa cuja assinatura ninguém leu. O platform admin é
 * conferido pelo layout desta rota.
 */
async function lerCobrancaDoTenant(orgId: string) {
  // Id que não é uuid daria 22P02 no PostgREST e esta página LANÇARIA (500);
  // sem card, o TenantOverviewClient já mostra "não foi possível carregar".
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return null;
  const [planos, assinatura, org] = await Promise.all([
    admin.from("cobranca_planos").select("id, nome, arquivado_em").order("nome"),
    admin
      .from("cobranca_assinaturas")
      .select("plano_id, estado, trial_ate, prazo_extra_ate, provedor, plano_agendado_id, proximo_vencimento")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin.from("organizations").select("status, suspended_kind, settings").eq("id", orgId).maybeSingle(),
  ]);
  if (planos.error || assinatura.error || org.error) {
    throw new Error(`cobrança do tenant: leitura falhou (${planos.error?.code ?? assinatura.error?.code ?? org.error?.code})`);
  }
  const rotulo = (org.data?.settings as { plan?: unknown } | null)?.plan;
  return {
    planos: (planos.data ?? []) as PlanoDoCard[],
    assinatura: (assinatura.data ?? null) as AssinaturaDoCard | null,
    suspensaPorCobranca: org.data?.status === "suspended" && org.data?.suspended_kind === "cobranca",
    rotuloAntigo: typeof rotulo === "string" && rotulo !== "" ? rotulo : null,
  };
}

/**
 * A capacidade `empresas` desta organização. `null` = o módulo `crm_b2b` está
 * desligado na instalação: não há o que a empresa ligar, e o card não aparece.
 */
async function lerEmpresasDoTenant(orgId: string): Promise<{ ligado: boolean } | null> {
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "crm_b2b"))) return null;
  const [{ data }, modulos] = await Promise.all([
    admin.from("organizations").select("settings").eq("id", orgId).maybeSingle(),
    modulosLigados(admin),
  ]);
  if (!data) return null;
  return { ligado: capacidadesLigadas(data.settings, modulos).includes("empresas") };
}

/** O atendimento com IA desta organização (ligado por padrão). `null` = id inválido ou inexistente. */
async function lerIaDoTenant(orgId: string): Promise<{ ligado: boolean } | null> {
  if (!z.string().uuid().safeParse(orgId).success) return null;
  const { data } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return null;
  return { ligado: iaLigadaNaEmpresa(data.settings) };
}
