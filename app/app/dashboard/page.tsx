import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

import { PainelClient } from "./_components/PainelClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard de Atendimento (Spec 04, fork Elite) — a primeira porta do grupo
 * Atendimento. Todo nível abre (D2); o que cada um VÊ é decidido pela rota
 * `GET /api/v1/painel/atendimento`. Aqui só se diz à tela se quem olha é
 * gerente, para ela montar os filtros certos.
 */
export default async function DashboardPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const gerente = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  return <PainelClient gerente={gerente} userId={user.id} />;
}
