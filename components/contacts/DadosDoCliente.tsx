"use client";

/**
 * DADOS DO CLIENTE — os campos do cliente em modo LEITURA, na Visão geral da
 * ficha do contato.
 *
 * Até aqui o valor dos campos personalizados só aparecia dentro do diálogo de
 * edição: quem abria a ficha para consultar não via nada. Campo vazio não ocupa
 * linha (uma coluna de travessões leria como cadastro quebrado), e campo
 * escondido pela condição `mostrar_quando` também não — a MESMA régua do
 * formulário (`camposVisiveis`), para a leitura não mostrar o que a edição
 * esconde.
 */
import { useT } from "@/hooks/i18n/useT";
import { valorPreenchido } from "@/lib/contacts/campos-do-cliente";
import { camposVisiveis } from "@/lib/schemas/mostrar-quando";
import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * O valor como TEXTO, pela régua do tipo. Exportada para o diálogo de
 * confirmação dizer "valor antigo → valor novo" com a mesma escrita da ficha.
 */
export function valorDoCampoEmTexto(
  campo: CustomFieldDef,
  v: unknown,
  rotulos: { sim: string; nao: string },
): string {
  if (!valorPreenchido(v)) return "";
  const rotuloDaOpcao = (valor: unknown) =>
    campo.options?.find((o) => o.value === valor)?.label ?? String(valor);
  switch (campo.type) {
    case "currency": {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n)
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
        : String(v);
    }
    case "date": {
      // PELOS PEDAÇOS, como a data de nascimento da ficha: `new Date("1990-09-14")`
      // nasce em UTC e, no fuso da tela, viraria o dia anterior.
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split("-").reverse().join("/") : s;
    }
    case "boolean":
      return v === true || v === "true" ? rotulos.sim : rotulos.nao;
    case "select":
      return rotuloDaOpcao(v);
    case "multiselect":
      return Array.isArray(v) ? v.map(rotuloDaOpcao).join(", ") : rotuloDaOpcao(v);
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

interface Props {
  campos: CustomFieldDef[];
  valores: Record<string, unknown>;
}

export function DadosDoCliente({ campos, valores }: Props) {
  const t = useT();
  const rotulos = { sim: t("Sim"), nao: t("Não") };
  const preenchidos = camposVisiveis(campos, valores).filter((c) =>
    valorPreenchido(valores[c.key]),
  );
  if (campos.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="dados-do-cliente">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase">
        {t("Dados do cliente")}
      </h3>
      {preenchidos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum dado do cliente preenchido. Use Editar para completar.")}
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          {preenchidos.map((c) => (
            <div key={c.key} className={c.type === "textarea" ? "md:col-span-2" : undefined}>
              <dt className="text-xs text-muted-foreground uppercase">{c.label}</dt>
              <dd className="mt-1 break-words whitespace-pre-wrap">
                {valorDoCampoEmTexto(c, valores[c.key], rotulos)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
