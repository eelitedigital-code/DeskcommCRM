"use client";

/**
 * EDITOR DE CAMPOS PERSONALIZADOS — a lista "chave · rótulo · tipo · opções ·
 * mostrar só quando" que a tela do funil e a de Campos do cliente usam.
 *
 * Saiu de dentro de `app/app/settings/tenant/pipelines/_client.tsx` quando os
 * campos do cliente ganharam tela própria: duas cópias do mesmo editor
 * divergiriam no mês (a lista de tipos digitada à mão já tinha encolhido uma
 * vez — ver `TIPOS_DE_CAMPO`).
 *
 * O que só faz sentido no funil fica atrás de `etapas`: sem etapas não há
 * "exigir ao entrar na etapa" nem "ao ganhar/perder", e o bloco some. O campo do
 * cliente não pertence a etapa nenhuma.
 */
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";
import {
  mostrarQuandoSchema,
  OPERADORES_DE_MOSTRA,
  type OperadorDeMostra,
} from "@/lib/schemas/mostrar-quando";
import { Plus, Trash } from "@/lib/ui/icons";

/**
 * Os tipos de campo que esta tela oferece — DERIVADOS do schema, nunca
 * reescritos à mão.
 *
 * Quando a lista era digitada aqui, ela encolheu sem ninguém ver: `multiselect`
 * existia em `customFieldSchema`, era gravado pela API e aparecia no dossiê
 * (`components/contacts/CustomFieldsEditor.tsx`), mas faltava nesta lista. O
 * efeito para quem abria a tela era um campo que parecia corrompido — o
 * `<Select>` recebia `value="multiselect"`, nenhum `SelectItem` casava, e o
 * seletor ficava EM BRANCO. Pior: as opções do campo só apareciam para
 * `select`, então um multiselect ficava sem como ser editado, e a saída óbvia
 * (escolher um tipo para "consertar" o branco) transformava a escolha múltipla
 * em escolha única.
 *
 * Derivar do schema faz a divergência deixar de ser possível: tipo novo lá
 * nasce oferecido aqui.
 */
export const TIPOS_DE_CAMPO = customFieldSchema.shape.type.options;

/**
 * O NOME DO TIPO PARA QUEM NÃO É TÉCNICO. O seletor mostrava a chave do schema
 * (`text`, `multiselect`…), e quem monta os campos de um cliente não precisa
 * saber inglês nem o que é "select". O valor gravado continua sendo a chave.
 */
export const ROTULO_DO_TIPO: Record<CustomFieldDef["type"], string> = {
  text: "Texto curto",
  textarea: "Texto longo",
  number: "Número",
  currency: "Moeda (BRL)",
  date: "Data",
  select: "Lista (uma opção)",
  multiselect: "Lista (várias opções)",
  boolean: "Sim ou não",
  email: "E-mail",
  phone: "Telefone",
  url: "Link",
};

/** Tipos cujo valor sai de uma lista fechada — são os que mostram o campo de opções. */
export function tipoTemOpcoes(tipo: CustomFieldDef["type"]): boolean {
  return tipo === "select" || tipo === "multiselect";
}

/**
 * Uma etapa do funil, do jeito que o editor de `obrigatorio_em` precisa ler.
 *
 * `is_archived` entra porque a lista É COMPLETA de propósito: descartar a etapa
 * arquivada na leitura apagaria silenciosamente a marca que alguém já fez — o
 * save regrava `fields` inteiro, então o que não aparece na tela some do
 * settings. Arquivada fica visível e marcada; ela não recebe card novo, mas
 * também não é apagada por baixo de quem a marcou.
 */
export interface EtapaDoFunil {
  id: string;
  name: string;
  is_archived: boolean;
}

/**
 * A regra `obrigatorio_em` normalizada — NADA MARCADO É AUSÊNCIA, não `{}`.
 *
 * `undefined` e `{}` significam a mesma coisa para `validaCamposExigidos`, mas
 * só o primeiro deixa o settings do funil idêntico ao de antes do #1536: gravar
 * `{ etapas: [], ao_ganhar: false, ao_perder: false }` encheria todo campo de
 * uma chave morta e faria o critério de aceite nº 3 ("sem `obrigatorio_em` o
 * comportamento é o de antes") depender de olhar para dentro do objeto.
 */
export function normalizaObrigatorioEm(
  regra: CustomFieldDef["obrigatorio_em"],
): CustomFieldDef["obrigatorio_em"] {
  const etapas = regra?.etapas ?? [];
  const aoGanhar = regra?.ao_ganhar === true;
  const aoPerder = regra?.ao_perder === true;
  if (etapas.length === 0 && !aoGanhar && !aoPerder) return undefined;
  return {
    ...(etapas.length > 0 ? { etapas } : {}),
    ...(aoGanhar ? { ao_ganhar: true } : {}),
    ...(aoPerder ? { ao_perder: true } : {}),
  };
}

/** Liga/desliga UMA etapa na regra do campo, sem mexer no resto da marca. */
export function comEtapa(
  regra: CustomFieldDef["obrigatorio_em"],
  etapaId: string,
  marcada: boolean,
): CustomFieldDef["obrigatorio_em"] {
  const etapas = new Set(regra?.etapas ?? []);
  if (marcada) etapas.add(etapaId);
  else etapas.delete(etapaId);
  return normalizaObrigatorioEm({ ...regra, etapas: [...etapas] });
}

/** Liga/desliga um dos dois gatilhos de FECHAMENTO (`ao_ganhar`/`ao_perder`). */
export function comGatilho(
  regra: CustomFieldDef["obrigatorio_em"],
  gatilho: "ao_ganhar" | "ao_perder",
  marcado: boolean,
): CustomFieldDef["obrigatorio_em"] {
  return normalizaObrigatorioEm({ ...regra, [gatilho]: marcado });
}

/**
 * Valor do `<Select>` que significa "sem condição" (issue #2728).
 *
 * Radix recusa `value=""` em `<SelectItem>`, e "mostrar sempre" precisa ser um
 * item da lista — não um placeholder que some assim que a pessoa escolhe.
 */
export const SEM_CONDICAO = "__sem_condicao__";

/** O `<Select>` de valor também precisa de item para "ainda não escolhi". */
export const SEM_VALOR_DA_CONDICAO = "__sem_valor_da_condicao__";

/**
 * O operador da condição, resolvendo as DUAS formas que ela pode estar gravada:
 * a da issue (`{campo, contem: "Outro"}`) e a par que o editor escreve
 * (`{campo, operador, valor}`). Sem condição, o padrão é `igual` — é o que o
 * seletor mostra antes de a pessoa montar a regra.
 */
export function operadorDaCondicao(condicao: CustomFieldDef["mostrar_quando"]): OperadorDeMostra {
  if (condicao?.operador) return condicao.operador;
  return OPERADORES_DE_MOSTRA.find((op) => condicao?.[op] !== undefined) ?? "igual";
}

/**
 * O valor da condição como TEXTO: é o que o input devolve, é o que a pessoa
 * digita, e é o que `campoVisivel` compara (`"2"` e `2` casam na régua de
 * número lá).
 */
export function valorDaCondicao(condicao: CustomFieldDef["mostrar_quando"]): string {
  const valor =
    condicao?.operador !== undefined ? condicao?.valor : condicao?.[operadorDaCondicao(condicao)];
  return valor === undefined || valor === null ? "" : String(valor);
}

/**
 * Monta a condição de volta na forma GRAVÁVEL — a que `mostrarQuandoSchema`
 * valida.
 *
 * Sem campo não há condição (a pessoa limpou o seletor, ou escolheu "Sempre
 * mostrar"). Com campo mas sem valor, a condição fica MEIO montada na tela —
 * é o estado de quem está digitando — e `normalizaMostrarQuando` a descarta
 * no save, do mesmo jeito que `obrigatorio_em` sem nenhuma marca é ausência.
 */
export function escreveMostrarQuando(
  condicao: CustomFieldDef["mostrar_quando"],
  mudanca: { campo?: string; operador?: OperadorDeMostra; valor?: string },
): CustomFieldDef["mostrar_quando"] {
  const proximo = {
    campo: mudanca.campo ?? condicao?.campo ?? "",
    operador: mudanca.operador ?? operadorDaCondicao(condicao),
    valor: mudanca.valor ?? valorDaCondicao(condicao),
  };
  const campo = proximo.campo.trim();
  if (campo.length === 0) return undefined;
  // O item "ainda não escolhi" do seletor de valor não é valor: gravá-lo
  // deixava a condição completa casando com nada, e o campo sumia para sempre.
  const valor = proximo.valor === SEM_VALOR_DA_CONDICAO ? "" : proximo.valor.trim();
  return {
    campo,
    operador: proximo.operador,
    ...(valor.length > 0 ? { valor } : {}),
  };
}

/**
 * A condição só grava quando está COMPLETA — o espelho exato de
 * `normalizaObrigatorioEm`: meio montada é ausência, e não um save que
 * recusa a tela inteira com a mensagem de um campo que a pessoa nem terminou
 * de configurar.
 */
export function normalizaMostrarQuando(
  condicao: CustomFieldDef["mostrar_quando"],
): CustomFieldDef["mostrar_quando"] {
  return mostrarQuandoSchema.safeParse(condicao).success ? condicao : undefined;
}

/**
 * A lista PRONTA PARA GRAVAR: opções aparadas, regras meio montadas
 * descartadas, cada campo validado por `customFieldSchema`. Devolve a mensagem
 * do primeiro campo inválido em vez de gravar parte da lista.
 */
export function prepararCamposParaGravar(
  fields: CustomFieldDef[],
): { ok: true; campos: CustomFieldDef[] } | { ok: false; mensagem: string | null } {
  const ok: CustomFieldDef[] = [];
  for (const f of fields) {
    // O item vazio que a vírgula deixou no input segue vivo até aqui — é o
    // preço de NÃO descartá-lo durante a digitação (ver o `onChange` das
    // opções). Ele nunca foi uma opção: `customFieldSchema` exige
    // `label.min(1)`, então filtrá-lo ANTES de validar é o que separa "acabei
    // de digitar uma vírgula" de "quero gravar uma opção em branco". É aqui
    // também que o espaço do FIM de cada opção é aparado: o `onChange` só
    // apara o início, para não apagar o espaço que a pessoa está digitando.
    const limpo = tipoTemOpcoes(f.type)
      ? {
          ...f,
          options: (f.options ?? [])
            .map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
            .filter((o) => o.label !== ""),
        }
      : f;
    // A regra de `obrigatorio_em` é normalizada AQUI, e não só durante a
    // digitação: um campo que chegou do settings com `{}` ou com marca
    // desligada sai sem a chave — é o que mantém o funil idêntico ao de antes
    // do #1536 enquanto ninguém marca nada.
    const { obrigatorio_em: regraBruta, ...semRegra } = limpo;
    const regra = normalizaObrigatorioEm(regraBruta);
    const base = regra ? { ...semRegra, obrigatorio_em: regra } : semRegra;
    // A condição de exibição passa pela MESMA régua (#2728): meio montada é
    // ausência, e não um save recusado com a mensagem de um campo que a
    // pessoa nem terminou de configurar.
    const { mostrar_quando: condicaoBruta, ...semCondicao } = base;
    const condicao = normalizaMostrarQuando(condicaoBruta);
    const comCondicao = condicao ? { ...semCondicao, mostrar_quando: condicao } : semCondicao;
    const parsed = customFieldSchema.safeParse(comCondicao);
    if (!parsed.success) {
      return { ok: false, mensagem: parsed.error.issues[0]?.message ?? null };
    }
    ok.push(parsed.data);
  }
  return { ok: true, campos: ok };
}

interface PropsDoEditor {
  fields: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
  /**
   * As etapas do funil — o que o bloco "Exigir o preenchimento" lista. Ausente
   * (campos do cliente), o bloco não aparece.
   */
  etapas?: EtapaDoFunil[];
}

export function EditorDeCampos({ fields, onChange, etapas }: PropsDoEditor) {
  const t = useT();
  return (
    <>
      {fields.map((f, i) => (
        <div
          key={`${f.key}-${i}`}
          className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-[1fr_1fr_8rem_auto]"
        >
          <Input
            aria-label={`${t("Chave do campo")} ${i + 1}`}
            placeholder={t("chave (endereco)")}
            value={f.key}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, key: e.target.value };
              onChange(next);
            }}
          />
          <Input
            aria-label={`${t("Rótulo do campo")} ${i + 1}`}
            placeholder={t("Rótulo (Endereço)")}
            value={f.label}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, label: e.target.value };
              onChange(next);
            }}
          />
          <Select
            value={f.type}
            onValueChange={(type) => {
              const next = [...fields];
              next[i] = { ...f, type: type as CustomFieldDef["type"] };
              onChange(next);
            }}
          >
            <SelectTrigger aria-label={`${t("Tipo do campo")} ${i + 1}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DE_CAMPO.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {t(ROTULO_DO_TIPO[tipo])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t("Remover campo")} ${f.label || i + 1}`}
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
          >
            <Trash size={14} aria-hidden />
          </Button>
          {tipoTemOpcoes(f.type) && (
            <Input
              className="md:col-span-3"
              aria-label={`${t("Opções do campo")} ${i + 1}`}
              placeholder={t("Opções, separadas por vírgula")}
              value={(f.options ?? []).map((o) => o.label).join(", ")}
              onChange={(e) => {
                // SEM `.filter(Boolean)` aqui, de propósito. O item vazio do
                // fim é o que a vírgula acabou de criar, e ele precisa
                // sobreviver até a pessoa digitar a palavra seguinte.
                // Descartá-lo no mesmo instante apaga o separador da tela —
                // digitar "Dor," some com a vírgula — e a tecla seguinte cola
                // na palavra anterior ("Dor" + "O" vira "DorO"). Com o item
                // vazio preservado, o `join(", ")` reescreve "Dor, " e o
                // cursor continua onde a pessoa parou. O vazio só é descartado
                // em `prepararCamposParaGravar`, quando deixa de ser útil. Pelo mesmo
                // motivo só o INÍCIO é aparado (o espaço que o `join(", ")`
                // põe): aparar o fim apagaria o espaço recém-digitado, e
                // "Clareamento" + " " + "D" viraria "ClareamentoD".
                const options = e.target.value
                  .split(",")
                  .map((s) => s.trimStart())
                  .map((label) => ({ value: label, label }));
                const next = [...fields];
                next[i] = { ...f, options };
                onChange(next);
              }}
            />
          )}
          {/* ── QUANDO ESTE CAMPO OBRIGA (issue #1536) ────────────────────
              O `obrigatorio_em` nasceu no schema sem nenhuma tela: quem
              operava não conseguia ligar a régua principal do PR. As três
              marcas são as que `campoExigidoNoDestino` lê — etapas de
              entrada, `ao_ganhar` e `ao_perder` — e nada mais, para a tela
              não prometer gatilho que o servidor não pergunta. */}
          {etapas && (
            <div className="space-y-1 md:col-span-4">
              <p className="text-xs font-medium">{t("Exigir o preenchimento:")}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {etapas.map((e) => (
                  <label key={e.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      aria-label={`${t("Exigir em")} ${e.name} — ${f.label || i + 1}`}
                      checked={f.obrigatorio_em?.etapas?.includes(e.id) ?? false}
                      onChange={(ev) => {
                        const next = [...fields];
                        next[i] = {
                          ...f,
                          obrigatorio_em: comEtapa(f.obrigatorio_em, e.id, ev.target.checked),
                        };
                        onChange(next);
                      }}
                    />
                    {e.name}
                    {e.is_archived ? ` (${t("arquivada")})` : ""}
                  </label>
                ))}
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`${t("Ao ganhar")} — ${f.label || i + 1}`}
                    checked={f.obrigatorio_em?.ao_ganhar === true}
                    onChange={(ev) => {
                      const next = [...fields];
                      next[i] = {
                        ...f,
                        obrigatorio_em: comGatilho(
                          f.obrigatorio_em,
                          "ao_ganhar",
                          ev.target.checked,
                        ),
                      };
                      onChange(next);
                    }}
                  />
                  {t("Ao ganhar")}
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`${t("Ao perder")} — ${f.label || i + 1}`}
                    checked={f.obrigatorio_em?.ao_perder === true}
                    onChange={(ev) => {
                      const next = [...fields];
                      next[i] = {
                        ...f,
                        obrigatorio_em: comGatilho(
                          f.obrigatorio_em,
                          "ao_perder",
                          ev.target.checked,
                        ),
                      };
                      onChange(next);
                    }}
                  />
                  {t("Ao perder")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Sem marca nenhuma este campo nunca é exigido — é o comportamento de sempre. Marcado, ele precisa estar preenchido para o negócio entrar na etapa escolhida ou ser fechado como ganho/perdido.",
                )}
              </p>
            </div>
          )}
          {/* ── QUANDO ESTE CAMPO APARECE (issue #2728) ──────────────────
              A condição que a ficha do contato, o dossiê e o painel do inbox
              leem para ESCONDER o campo. Campo + operador + valor, e os
              operadores são exatamente os três que `campoVisivel` aplica —
              a tela não promete nenhum outro. Meio montada, a condição não
              grava (ver `normalizaMostrarQuando`), como `obrigatorio_em`. */}
          <div className="space-y-1 md:col-span-4">
            <p className="text-xs font-medium">{t("Mostrar só quando:")}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Select
                value={f.mostrar_quando?.campo || SEM_CONDICAO}
                onValueChange={(campo) => {
                  const next = [...fields];
                  next[i] = {
                    ...f,
                    mostrar_quando:
                      campo === SEM_CONDICAO
                        ? undefined
                        : escreveMostrarQuando(f.mostrar_quando, { campo }),
                  };
                  onChange(next);
                }}
              >
                <SelectTrigger aria-label={`${t("Campo da condição")} ${f.label || i + 1}`}>
                  <SelectValue placeholder={t("Sempre mostrar")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CONDICAO}>{t("Sempre mostrar")}</SelectItem>
                  {fields
                    .filter((outra, j) => j !== i && outra.key.trim().length > 0)
                    .map((outra) => (
                      <SelectItem key={outra.key} value={outra.key}>
                        {outra.label || outra.key}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {f.mostrar_quando?.campo && (
                <>
                  <Select
                    value={operadorDaCondicao(f.mostrar_quando)}
                    onValueChange={(op) => {
                      const next = [...fields];
                      next[i] = {
                        ...f,
                        mostrar_quando: escreveMostrarQuando(f.mostrar_quando, {
                          operador: op as OperadorDeMostra,
                        }),
                      };
                      onChange(next);
                    }}
                  >
                    <SelectTrigger aria-label={`${t("Operador da condição")} ${f.label || i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="igual">{t("é igual a")}</SelectItem>
                      <SelectItem value="contem">{t("contém")}</SelectItem>
                      <SelectItem value="maior_que">{t("é maior que")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* O valor vem de lista quando o campo que MANDA na condição
                      é de lista fechada: digitar "Outro" errado deixaria a
                      condição montada e quieta, casando com nada. */}
                  {tipoTemOpcoes(
                    fields.find((o) => o.key === f.mostrar_quando?.campo)?.type ?? "text",
                  ) ? (
                    <Select
                      value={valorDaCondicao(f.mostrar_quando) || SEM_VALOR_DA_CONDICAO}
                      onValueChange={(valor) => {
                        const next = [...fields];
                        next[i] = {
                          ...f,
                          mostrar_quando: escreveMostrarQuando(f.mostrar_quando, { valor }),
                        };
                        onChange(next);
                      }}
                    >
                      <SelectTrigger aria-label={`${t("Valor da condição")} ${f.label || i + 1}`}>
                        <SelectValue placeholder={t("Valor da condição")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_VALOR_DA_CONDICAO}>
                          {t("Valor da condição")}
                        </SelectItem>
                        {fields
                          .find((o) => o.key === f.mostrar_quando?.campo)
                          ?.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="w-40"
                      aria-label={`${t("Valor da condição")} ${f.label || i + 1}`}
                      value={valorDaCondicao(f.mostrar_quando)}
                      onChange={(ev) => {
                        const next = [...fields];
                        next[i] = {
                          ...f,
                          mostrar_quando: escreveMostrarQuando(f.mostrar_quando, {
                            valor: ev.target.value,
                          }),
                        };
                        onChange(next);
                      }}
                    />
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Escondido, o campo não aparece no formulário nem é validado como obrigatório, e o valor já gravado continua no registro.",
              )}
            </p>
          </div>
        </div>
      ))}
      {fields.length < 50 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...fields,
              { key: `campo_${fields.length + 1}`, label: t("Novo campo"), type: "text" },
            ])
          }
        >
          <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar campo")}
        </Button>
      )}
    </>
  );
}
