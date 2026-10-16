/**
 * O cache curto do painel (D4) — N telas da mesma empresa, UMA consulta por
 * janela de cache.
 *
 * Duas garantias, e as duas são o ponto:
 *
 *   1. **Uma consulta por chave por janela.** Quem chega enquanto a consulta
 *      está em voo recebe a MESMA promessa (single-flight): dez abas abertas
 *      ao mesmo tempo não viram dez consultas, nem na primeira carga.
 *   2. **A chave nunca cruza organização.** Ela começa pela organização e leva
 *      os filtros e o nível de acesso (§7). `invalidarOrganizacao` apaga só as
 *      chaves daquela organização — mudar a régua de uma empresa não esvazia o
 *      painel das outras.
 *
 * Memória do processo, não Redis: o app roda num contêiner só na VPS, e o
 * resultado é número agregado, sem dado pessoal. Com mais de uma réplica cada
 * uma teria o seu cache — o custo vira "uma consulta por janela POR réplica",
 * ainda limitado. Falha da consulta não fica guardada: a próxima tenta de novo.
 */

export const VALIDADE_DO_CACHE_MS = 45_000;
const MAXIMO_DE_CHAVES = 500;

interface Entrada<T> {
  expiraEm: number;
  criadoEm: number;
  valor: Promise<T>;
}

export interface ChaveDoPainel {
  organizationId: string;
  periodo: string;
  de?: string | null;
  ate?: string | null;
  numero?: string | null;
  atendente?: string | null;
  /** O nível de acesso de quem pergunta (§7): entra na chave. */
  nivel: string;
}

export function chaveDoPainel(c: ChaveDoPainel): string {
  return [c.organizationId, c.periodo, c.de ?? "", c.ate ?? "", c.numero ?? "", c.atendente ?? "", c.nivel].join("|");
}

export interface Lido<T> {
  valor: T;
  /** Quando a consulta que produziu `valor` começou. */
  criadoEm: number;
  /** `true` quando esta chamada pegou um resultado já pronto ou em voo. */
  doCache: boolean;
}

export class CacheDoPainel<T> {
  private readonly entradas = new Map<string, Entrada<T>>();

  constructor(
    private readonly validadeMs: number = VALIDADE_DO_CACHE_MS,
    private readonly agora: () => number = Date.now,
  ) {}

  async obter(chave: ChaveDoPainel, carregar: () => Promise<T>): Promise<Lido<T>> {
    const k = chaveDoPainel(chave);
    const t = this.agora();
    const existente = this.entradas.get(k);
    if (existente && existente.expiraEm > t) {
      return { valor: await existente.valor, criadoEm: existente.criadoEm, doCache: true };
    }

    const valor = carregar();
    const entrada: Entrada<T> = { expiraEm: t + this.validadeMs, criadoEm: t, valor };
    this.entradas.set(k, entrada);
    this.podar(t);
    try {
      return { valor: await valor, criadoEm: t, doCache: false };
    } catch (erro) {
      // Só apaga se ainda for a MESMA entrada (outra chamada pode ter renovado).
      if (this.entradas.get(k) === entrada) this.entradas.delete(k);
      throw erro;
    }
  }

  invalidarOrganizacao(organizationId: string): void {
    const prefixo = `${organizationId}|`;
    for (const k of [...this.entradas.keys()]) if (k.startsWith(prefixo)) this.entradas.delete(k);
  }

  /** Só para teste. */
  tamanho(): number {
    return this.entradas.size;
  }

  private podar(t: number): void {
    for (const [k, e] of this.entradas) if (e.expiraEm <= t) this.entradas.delete(k);
    while (this.entradas.size > MAXIMO_DE_CHAVES) {
      const maisVelha = this.entradas.keys().next().value;
      if (maisVelha === undefined) break;
      this.entradas.delete(maisVelha);
    }
  }
}
