/**
 * O período do painel (§5): hoje, 7 dias, 30 dias (padrão) ou personalizado.
 *
 * "Hoje" começa à meia-noite NO FUSO DA ORGANIZAÇÃO, não em UTC — às 22h de
 * Brasília o dia UTC já virou, e o painel mostraria o dia seguinte vazio.
 */
import { instanteDe, partesNoFuso } from "@/lib/agenda/fuso";
import { fusoUtilizavel } from "@/lib/tempo/fusos";

export const PERIODOS = ["hoje", "7d", "30d", "personalizado"] as const;
export type Periodo = (typeof PERIODOS)[number];

/** Teto do personalizado: um trimestre. Mais que isso é relatório, não painel. */
export const MAXIMO_DE_DIAS = 92;
const DIA_MS = 24 * 60 * 60 * 1000;

export type Janela = { ok: true; de: Date; ate: Date } | { ok: false; motivo: "faltam_datas" | "invertida" | "longa_demais" };

export function janelaDoPeriodo(
  periodo: Periodo,
  opcoes: { de?: string | null; ate?: string | null; fuso?: string | null; agora?: Date } = {},
): Janela {
  const agora = opcoes.agora ?? new Date();
  if (periodo === "hoje") {
    const fuso = fusoUtilizavel(opcoes.fuso);
    const p = partesNoFuso(agora, fuso);
    return { ok: true, de: instanteDe({ ano: p.ano, mes: p.mes, dia: p.dia, hora: 0, minuto: 0, segundo: 0 }, fuso), ate: agora };
  }
  if (periodo === "7d") return { ok: true, de: new Date(agora.getTime() - 7 * DIA_MS), ate: agora };
  if (periodo === "30d") return { ok: true, de: new Date(agora.getTime() - 30 * DIA_MS), ate: agora };

  if (!opcoes.de || !opcoes.ate) return { ok: false, motivo: "faltam_datas" };
  const de = new Date(opcoes.de);
  const ate = new Date(opcoes.ate);
  if (!(de.getTime() < ate.getTime())) return { ok: false, motivo: "invertida" };
  if (ate.getTime() - de.getTime() > MAXIMO_DE_DIAS * DIA_MS) return { ok: false, motivo: "longa_demais" };
  return { ok: true, de, ate };
}
