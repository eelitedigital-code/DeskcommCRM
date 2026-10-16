import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";

/**
 * CAMPOS DO CLIENTE — as definições que pertencem à ORGANIZAÇÃO, não ao funil.
 *
 * Moram em `organizations.settings.contact_fields[]`, com o MESMO
 * `customFieldSchema` dos campos de funil, e o valor de cada uma mora em
 * `contacts.custom_fields`. Antes daqui a ficha do contato lia as definições do
 * funil padrão: com dois funis, o dado do cliente dependia de qual funil era o
 * padrão naquele dia.
 *
 * Sem mudança de schema de banco: `organizations.settings` já é jsonb e já
 * guarda `branding` e `security`.
 */
export const CHAVE_DOS_CAMPOS_DO_CLIENTE = "contact_fields";

/** O teto da lista — o mesmo dos campos de funil (o editor para em 50). */
export const MAXIMO_DE_CAMPOS_DO_CLIENTE = 50;

/**
 * Lê `organizations.settings.contact_fields` sem explodir se o jsonb estiver
 * velho, vazio ou com uma entrada torta. Todo campo sai com `escopo: "contato"`:
 * é o lugar de onde veio que decide de quem é o valor, não o que está gravado.
 */
export function camposDoCliente(
  settings: Record<string, unknown> | null | undefined,
): CustomFieldDef[] {
  if (!settings) return [];
  const raw = settings[CHAVE_DOS_CAMPOS_DO_CLIENTE];
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  for (const item of raw) {
    const parsed = customFieldSchema.safeParse(item);
    if (parsed.success) out.push({ ...parsed.data, escopo: "contato" });
  }
  return out;
}

/**
 * Os campos do FUNIL que continuam do negócio — tira os que o cadastro do
 * cliente já define com a mesma chave.
 *
 * É a regra da colisão legada: a mesma chave nos dois lados mostra o valor do
 * contato. O valor no negócio NÃO é apagado — o PATCH do negócio só leva as
 * chaves alteradas (`soChavesAlteradas`), e um campo que não aparece não é
 * alterado. Ele só deixa de ser exibido.
 */
export function camposDoNegocio<T extends { key: string }>(
  camposDoFunil: T[],
  camposDoClienteDaOrg: ReadonlyArray<{ key: string }>,
): T[] {
  if (camposDoClienteDaOrg.length === 0) return camposDoFunil;
  const doCliente = new Set(camposDoClienteDaOrg.map((c) => c.key));
  return camposDoFunil.filter((c) => !doCliente.has(c.key));
}

/**
 * Valor PREENCHIDO, na régua da tela: vazio não ocupa linha na Visão geral e
 * preencher o que estava vazio não pede confirmação.
 */
export function valorPreenchido(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Grava SÓ o que mudou por cima do valor atual do banco.
 *
 * O PATCH do contato SUBSTITUI `custom_fields` (é o que permite apagar um campo
 * pela ficha). Quem edita um pedaço — o painel da conversa, o dossiê do negócio
 * — precisa partir do objeto inteiro mais recente, senão apaga as chaves que
 * não renderizou. Chave limpa na tela (`null`, que é o que `soChavesAlteradas`
 * devolve, ou `undefined`) sai do objeto.
 */
export function aplicarMudancas(
  atual: Record<string, unknown>,
  mudancas: Record<string, unknown>,
): Record<string, unknown> {
  const proximo: Record<string, unknown> = { ...atual };
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === undefined || v === null) delete proximo[k];
    else proximo[k] = v;
  }
  return proximo;
}
