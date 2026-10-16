import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_ORG,
  GOV_PIPELINE,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
} from "./gov-helpers";

/**
 * EQUIPE DA EMPRESA e PAINEL DE VENDAS (Especificação 02, fork Elite —
 * migration 9001). Roda só via `pnpm test:db`.
 *
 *   1. As duas colunas da 9001 existem, e `companies.custom_fields` só aceita
 *      objeto (o mesmo CHECK da 0211 em contatos).
 *   2. LGPD pelos DOIS caminhos de anonimizar — a cascata do pedido formal
 *      (`fn_lgpd_cascade_redact_contact`) e a rota direta da ficha
 *      (`fn_lgpd_anonymize_contact`) —: nome, e-mail e cargo somem da camada
 *      B2B; o vínculo, a data de saída e o VALOR da venda ficam (D8). A
 *      redação em si é a da 0449; aqui se prova que ela vale para a equipe e o
 *      painel novos, e que `saiu_em` não é apagado.
 *   3. ISOLAMENTO no caminho empresa → equipe → vendas: quem é de outra
 *      organização não lê nenhum dos três elos.
 */

const ORG_B = "e1e00000-0000-4000-8000-00000000000b";
const USER_B = "e1e00000-1111-4000-8000-00000000000b";

const EMPRESA = "e1e00000-2222-4000-8000-000000000001";
const ETAPA_GANHO = "e1e00000-2222-4000-8000-000000000009";
const PESSOA_JOAO = "e1e00000-3333-4000-8000-000000000001";
const PESSOA_MARIA = "e1e00000-3333-4000-8000-000000000002";
const CONTATO_JOAO = "e1e00000-4444-4000-8000-000000000001";
const CONTATO_MARIA = "e1e00000-4444-4000-8000-000000000002";
const VENDA_JOAO = "e1e00000-5555-4000-8000-000000000001";
const VENDA_MARIA = "e1e00000-5555-4000-8000-000000000002";

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email) values ('${USER_B}', 'elite-b@invariant.test') on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'elite-inv-b', 'Elite B', 'Elite B') on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'admin', now()) on conflict do nothing;

    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position, is_won)
      values ('${ETAPA_GANHO}', '${GOV_ORG}', '${GOV_PIPELINE}', 'Ganho Elite', 'ganho-elite', 90, true);

    insert into public.companies (id, organization_id, trade_name, legal_name)
      values ('${EMPRESA}', '${GOV_ORG}', 'Calçados Nova Serrana', 'Calçados Nova Serrana LTDA');
    insert into public.people (id, organization_id, full_name, normalized_name, email) values
      ('${PESSOA_JOAO}', '${GOV_ORG}', 'João Silva', 'joao silva', 'joao@invariant.test'),
      ('${PESSOA_MARIA}', '${GOV_ORG}', 'Maria Silva', 'maria silva', 'maria@invariant.test');
    insert into public.company_people (organization_id, company_id, person_id, job_title, department, saiu_em) values
      ('${GOV_ORG}', '${EMPRESA}', '${PESSOA_JOAO}', 'Sócio', 'Diretoria', null),
      ('${GOV_ORG}', '${EMPRESA}', '${PESSOA_MARIA}', 'Sócia', 'Compras', '2026-09-30T00:00:00Z');
    insert into public.contacts (id, organization_id, name, display_name, phone_number, person_id, source) values
      ('${CONTATO_JOAO}', '${GOV_ORG}', 'João Silva', 'João', '+5537999991234', '${PESSOA_JOAO}', 'manual'),
      ('${CONTATO_MARIA}', '${GOV_ORG}', 'Maria Silva', 'Maria', '+5537999989876', '${PESSOA_MARIA}', 'manual');
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title, status, value_cents, currency, closed_at, position_in_stage) values
      ('${VENDA_JOAO}', '${GOV_ORG}', '${GOV_PIPELINE}', '${ETAPA_GANHO}', '${CONTATO_JOAO}', 'Consultoria', 'won', 1500000, 'BRL', now(), 1),
      ('${VENDA_MARIA}', '${GOV_ORG}', '${GOV_PIPELINE}', '${ETAPA_GANHO}', '${CONTATO_MARIA}', 'Treinamento', 'won', 1000000, 'BRL', now(), 2);
  `);
});

describe("migration 9001 — as duas colunas", () => {
  it("company_people.saiu_em e companies.custom_fields existem", () => {
    expect(
      lastLine(
        sql(`select count(*) from information_schema.columns where table_schema='public'
               and ((table_name='company_people' and column_name='saiu_em')
                 or (table_name='companies' and column_name='custom_fields'));`),
      ),
    ).toBe("2");
  });

  it("custom_fields nasce objeto vazio e recusa o que não é objeto", () => {
    expect(
      lastLine(sql(`select custom_fields::text from public.companies where id='${EMPRESA}';`)),
    ).toBe("{}");
    expect(() =>
      sql(`update public.companies set custom_fields = '[1,2]'::jsonb where id='${EMPRESA}';`),
    ).toThrow(/companies_custom_fields_object/);
  });

  it("a equipe soma as duas vendas, inclusive de quem já saiu (D3)", () => {
    expect(
      lastLine(
        sql(`select sum(l.value_cents) from public.company_people cp
               join public.contacts c on c.person_id = cp.person_id and c.organization_id = cp.organization_id
               join public.crm_leads l on l.contact_id = c.id and l.organization_id = c.organization_id
              where cp.company_id = '${EMPRESA}' and l.status = 'won';`),
      ),
    ).toBe("2500000");
  });
});

describe("LGPD: anonimizar apaga nome e cargo na camada B2B, e a venda fica (D8)", () => {
  it("caminho 1 — cascata do pedido formal (fn_lgpd_cascade_redact_contact)", () => {
    sql(
      `select public.fn_lgpd_cascade_redact_contact('${GOV_ORG}', '${CONTATO_JOAO}', gen_random_uuid());`,
    );
    const pessoa = lastLine(
      sql(
        `select full_name || '|' || coalesce(email,'') from public.people where id='${PESSOA_JOAO}';`,
      ),
    );
    expect(pessoa).not.toMatch(/João|joao@/);
    expect(pessoa).toMatch(/^Pessoa anonimizada #/);
    expect(
      lastLine(
        sql(`select coalesce(job_title,'') || '|' || coalesce(department,'') || '|' || (saiu_em is null)
               from public.company_people where person_id='${PESSOA_JOAO}';`),
      ),
    ).toBe("||true");
    // O vínculo e a venda continuam: o painel da empresa ainda soma o valor.
    expect(
      lastLine(
        sql(`select value_cents || '|' || status from public.crm_leads where id='${VENDA_JOAO}';`),
      ),
    ).toBe("1500000|won");
    expect(
      lastLine(sql(`select count(*) from public.company_people where company_id='${EMPRESA}';`)),
    ).toBe("2");
  });

  it("caminho 2 — rota direta da ficha (fn_lgpd_anonymize_contact), com quem já tinha SAÍDO", () => {
    // A rota direta roda COMO o admin logado (a função confere papel pelo
    // auth.uid()), como em `lgpd-agenda-lock-order.test.ts`.
    sql(`
      set role authenticated;
      select set_config('request.jwt.claims',
        '{"sub":"${GOV_ADMIN}","role":"authenticated","aal":"aal2"}', false);
      select public.fn_lgpd_anonymize_contact('${GOV_ORG}', '${CONTATO_MARIA}');
    `);
    expect(
      lastLine(sql(`select full_name from public.people where id='${PESSOA_MARIA}';`)),
    ).toMatch(/^Pessoa anonimizada #/);
    // Cargo apagado, mas a DATA de saída fica: é o fato, não dado do titular.
    expect(
      lastLine(
        sql(`select coalesce(job_title,'') || '|' || to_char(saiu_em at time zone 'UTC', 'YYYY-MM-DD')
               from public.company_people where person_id='${PESSOA_MARIA}';`),
      ),
    ).toBe("|2026-09-30");
    expect(
      lastLine(sql(`select value_cents from public.crm_leads where id='${VENDA_MARIA}';`)),
    ).toBe("1000000");
  });

  it("o total da empresa não muda depois das duas anonimizações", () => {
    expect(
      lastLine(
        sql(`select sum(l.value_cents) from public.company_people cp
               join public.contacts c on c.person_id = cp.person_id and c.organization_id = cp.organization_id
               join public.crm_leads l on l.contact_id = c.id and l.organization_id = c.organization_id
              where cp.company_id = '${EMPRESA}' and l.status = 'won';`),
      ),
    ).toBe("2500000");
  });
});

describe("isolamento: empresa → equipe → vendas", () => {
  it("controle positivo: quem é da organização lê os três elos", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.companies where id='${EMPRESA}'`)).toBe(
      1,
    );
    expect(
      countAs(
        GOV_VIEWER,
        `select count(*) from public.company_people where company_id='${EMPRESA}'`,
      ),
    ).toBe(2);
  });

  it("outra organização não lê a empresa, a equipe, as pessoas, os contatos nem as vendas", () => {
    expect(countAs(USER_B, `select count(*) from public.companies where id='${EMPRESA}'`)).toBe(0);
    expect(
      countAs(USER_B, `select count(*) from public.company_people where company_id='${EMPRESA}'`),
    ).toBe(0);
    expect(
      countAs(
        USER_B,
        `select count(*) from public.people where id in ('${PESSOA_JOAO}','${PESSOA_MARIA}')`,
      ),
    ).toBe(0);
    expect(
      countAs(
        USER_B,
        `select count(*) from public.contacts where id in ('${CONTATO_JOAO}','${CONTATO_MARIA}')`,
      ),
    ).toBe(0);
    expect(
      countAs(
        USER_B,
        `select count(*) from public.crm_leads where id in ('${VENDA_JOAO}','${VENDA_MARIA}')`,
      ),
    ).toBe(0);
  });
});
