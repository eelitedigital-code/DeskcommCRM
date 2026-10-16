import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * CAMPOS PRONTOS — o catálogo que a tela Campos do cliente oferece para LIGAR,
 * sem a pessoa precisar saber o que é chave, tipo ou opção.
 *
 * Ligar grava a definição exatamente como está aqui em
 * `organizations.settings.contact_fields`; desligar tira a definição e deixa o
 * valor de cada contato intocado (`contacts.custom_fields`), então religar traz
 * de volta o que já tinha sido preenchido. Por isso a CHAVE de um campo pronto
 * nunca muda: ela é o endereço do valor em todos os contatos que já o usaram.
 *
 * Depois de ligado, o campo é um campo como outro qualquer: as opções podem ser
 * ajustadas no editor de "Campos próprios".
 */
export interface CampoPronto {
  grupo: string;
  /** Uma linha, para quem decide se liga ou não. */
  descricao: string;
  campo: CustomFieldDef;
}

const opcoes = (...rotulos: string[]) => rotulos.map((r) => ({ value: r, label: r }));

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export const CAMPOS_PRONTOS: readonly CampoPronto[] = [
  // ─── Dados pessoais ───
  {
    grupo: "Dados pessoais",
    descricao: "Para segmentar campanhas e personalizar o atendimento.",
    campo: {
      key: "sexo",
      label: "Sexo",
      type: "select",
      options: opcoes("Feminino", "Masculino", "Outro", "Prefere não informar"),
    },
  },
  {
    grupo: "Dados pessoais",
    descricao: "Cargo ou função de quem fala com a sua equipe.",
    campo: { key: "cargo", label: "Cargo", type: "text" },
  },
  {
    grupo: "Dados pessoais",
    descricao: "O @ do perfil do cliente.",
    campo: { key: "instagram", label: "Instagram", type: "text" },
  },
  // ─── Endereço ───
  {
    grupo: "Endereço",
    descricao: "Cidade onde o cliente está.",
    campo: { key: "cidade", label: "Cidade", type: "text" },
  },
  {
    grupo: "Endereço",
    descricao: "Lista com as 27 UFs.",
    campo: { key: "estado", label: "Estado", type: "select", options: opcoes(...UFS) },
  },
  {
    grupo: "Endereço",
    descricao: "Para quem atende fora do Brasil.",
    campo: { key: "pais", label: "País", type: "text" },
  },
  {
    grupo: "Endereço",
    descricao: "CEP do cliente.",
    campo: { key: "cep", label: "CEP", type: "text" },
  },
  // ─── Comercial ───
  {
    grupo: "Comercial",
    descricao: "Nome da empresa do cliente, quando ele compra como empresa.",
    campo: { key: "empresa", label: "Empresa", type: "text" },
  },
  {
    grupo: "Comercial",
    descricao: "Várias escolhas. Troque as opções pelos seus produtos depois de ativar.",
    campo: {
      key: "produtos_interesse",
      label: "Produtos de interesse",
      type: "multiselect",
      options: opcoes("Produto 1", "Produto 2", "Produto 3"),
    },
  },
  {
    grupo: "Comercial",
    descricao: "Faixa de faturamento mensal da empresa do cliente.",
    campo: {
      key: "faturamento_mensal",
      label: "Faturamento mensal",
      type: "select",
      options: opcoes(
        "Até R$ 10 mil",
        "R$ 10 mil a R$ 50 mil",
        "R$ 50 mil a R$ 200 mil",
        "R$ 200 mil a R$ 1 milhão",
        "Acima de R$ 1 milhão",
      ),
    },
  },
  // ─── Marketplaces ───
  {
    grupo: "Marketplaces",
    descricao: "Onde o cliente já vende. Várias escolhas.",
    campo: {
      key: "marketplaces",
      label: "Marketplaces em que vende",
      type: "multiselect",
      options: opcoes(
        "Shopee",
        "Mercado Livre",
        "TikTok Shop",
        "Amazon",
        "Magalu",
        "Shein",
        "Loja própria",
        "Ainda não vende",
      ),
    },
  },
  {
    grupo: "Marketplaces",
    descricao: "Fabricante, revendedor, distribuidor…",
    campo: {
      key: "tipo_de_negocio",
      label: "Tipo de negócio",
      type: "select",
      options: opcoes("Fabricante", "Revendedor", "Distribuidor", "Importador", "Outro"),
    },
  },
  // ─── Relacionamento ───
  {
    grupo: "Relacionamento",
    descricao: "De onde o cliente veio.",
    campo: {
      key: "como_conheceu",
      label: "Como conheceu",
      type: "select",
      options: opcoes("Instagram", "Indicação", "Google", "WhatsApp", "Evento", "Outro"),
    },
  },
  {
    grupo: "Relacionamento",
    descricao: "Por onde o cliente prefere ser procurado.",
    campo: {
      key: "canal_preferido",
      label: "Canal preferido",
      type: "select",
      options: opcoes("WhatsApp", "Ligação", "E-mail", "Instagram"),
    },
  },
  {
    grupo: "Relacionamento",
    descricao: "Melhor período para falar com o cliente.",
    campo: {
      key: "melhor_horario",
      label: "Melhor horário",
      type: "select",
      options: opcoes("Manhã", "Tarde", "Noite"),
    },
  },
  {
    grupo: "Relacionamento",
    descricao: "Texto livre para o que não cabe nos outros campos.",
    campo: { key: "observacoes", label: "Observações", type: "textarea" },
  },
];

/** Os grupos, na ordem em que aparecem no catálogo. */
export function gruposDosCamposProntos(): string[] {
  return [...new Set(CAMPOS_PRONTOS.map((p) => p.grupo))];
}

/** Liga (acrescenta no fim) ou desliga (tira pela chave) um campo pronto. */
export function comCampoPronto(
  atuais: CustomFieldDef[],
  pronto: CampoPronto,
  ligar: boolean,
): CustomFieldDef[] {
  const semEle = atuais.filter((c) => c.key !== pronto.campo.key);
  return ligar ? [...semEle, { ...pronto.campo }] : semEle;
}
