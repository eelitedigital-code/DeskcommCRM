/**
 * Configurações → Campos da empresa. Os dados que a organização guarda de cada
 * EMPRESA cliente (cadastro B2B), além do que a consulta do CNPJ traz.
 * Definições em `organizations.settings.company_fields`; valores em
 * `companies.custom_fields` (migration 9001).
 *
 * Gate: `manager`+ e a capacidade `empresas` ligada — a mesma porta do resto do
 * cadastro B2B (`app/app/companies/layout.tsx`).
 */
import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { camposDaEmpresa } from "@/lib/contacts/campos-do-cliente";
import { traduzir } from "@/lib/i18n/dicionario";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { capacidadesDaOrganizacao } from "@/lib/organizacao/capacidades";
import { createAdminClient } from "@/lib/supabase/admin";

import { CamposDaEmpresaClient } from "./_client";

export const metadata = { title: "Campos da empresa" };
export const dynamic = "force-dynamic";

export default async function CamposDaEmpresaPage() {
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "crm_b2b"))) notFound();
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) redirect("/403");
  if (!(await capacidadesDaOrganizacao(admin, activeOrg.orgId)).includes("empresas"))
    redirect("/403");

  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const campos = camposDaEmpresa((org?.settings ?? null) as Record<string, unknown> | null);

  const idioma = user.idioma;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Campos da empresa", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Aparecem na ficha de cada empresa cliente, além dos dados da consulta do CNPJ e dos links da loja.",
            idioma,
          )}
        </p>
      </header>
      <CamposDaEmpresaClient campos={campos} />
    </div>
  );
}
