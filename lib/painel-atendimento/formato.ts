/**
 * Formatos do Dashboard de Atendimento — puros, para a tela e os testes.
 *
 * Duração: a régua da operação vai de segundos (IA) a dias (pedido esquecido
 * no fim de semana). "57600 s" ou "960 min" não se leem de relance; aqui sai a
 * maior unidade que faz sentido, com no máximo duas partes. `null` = "—"
 * (não medido), nunca "0 s".
 */

export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) return restoMin === 0 ? `${h} h` : `${h} h ${String(restoMin).padStart(2, "0")} min`;
  const d = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH === 0 ? `${d} d` : `${d} d ${restoH} h`;
}

/** Variação em % com sinal; `null` (período anterior zerado) = sem texto. */
export function formatarVariacao(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}%`;
}

/** Hora cheia como faixa: 9 → "9h". */
export function rotuloDaHora(hora: number): string {
  return `${hora}h`;
}
