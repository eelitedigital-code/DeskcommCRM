import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * Spec 04 (fork Elite) — o painel de atendimento, contra o banco REAL do
 * baseline.
 *
 * O que se prova aqui é a CONTA, não a tela:
 *
 *   - o pareamento de resposta: cliente que fala duas vezes (o relógio corre
 *     desde a primeira), resposta de IA marcada como IA, mensagem de automação
 *     que não responde nem zera a espera, conversa sem resposta fora da média,
 *     virada de dia;
 *   - a regra de horário (D11 + D5): número com janela conta só a janela;
 *     número sem janela conta 24 h; número com agente de IA no ar conta 24 h
 *     quando a organização usa IA, e só a janela quando não usa ou quando a
 *     regra está desligada — a MESMA conversa noturna nos três casos;
 *   - a 1ª resposta na régua da tela Desempenho (paridade com
 *     `fn_attendant_metrics`);
 *   - grupo fora (D8), fila de agora por faixa, séries por hora e por dia;
 *   - contatos novos por origem (D9): vazio fica vazio (a tela chama de "Sem
 *     origem"), webhook ganha o nome da fonte, grupo/pessoal/mesclado fora;
 *   - isolamento entre duas organizações;
 *   - só o service_role executa a função do painel.
 *
 * Namespace e04a… (exclusivo deste arquivo). Sem PII: @invariant.test.
 * Fuso das organizações: America/Sao_Paulo (-03, sem horário de verão em 2026).
 * 13/07/2026 é segunda-feira; 12/07, domingo.
 */

const ORG = "e04a0000-0000-4000-8000-000000000001";
const ORG_B = "e04a0000-0000-4000-8000-000000000002";
const GERENTE = "e04a1111-0000-4000-8000-000000000001";
const ATENDENTE = "e04a1111-0000-4000-8000-000000000002";
const ATENDENTE_B = "e04a1111-0000-4000-8000-000000000003";

const S_SEM = "e04a2222-0000-4000-8000-000000000001"; // sem janela configurada
const S_JANELA = "e04a2222-0000-4000-8000-000000000002"; // janela de resposta 8h-18h
const S_IA = "e04a2222-0000-4000-8000-000000000003"; // janela 8h-18h + agente no ar
const S_B = "e04a2222-0000-4000-8000-000000000004"; // número da outra organização

const AGENTE = "e04a3333-0000-4000-8000-000000000001";
const VERSAO = "e04a3333-0000-4000-8000-000000000002";

const C1 = "e04a5555-0000-4000-8000-000000000001"; // fala duas vezes; humano; automação; IA
const C2 = "e04a5555-0000-4000-8000-000000000002"; // automação no meio da espera
const C3 = "e04a5555-0000-4000-8000-000000000003"; // sem resposta
const C4 = "e04a5555-0000-4000-8000-000000000004"; // janela 8-18, vira o dia
const C5 = "e04a5555-0000-4000-8000-000000000005"; // noturna no número com IA
const C_GRUPO = "e04a5555-0000-4000-8000-000000000006"; // grupo: fora
const C_B = "e04a5555-0000-4000-8000-000000000007"; // outra organização

const CT = (n: number) => `('e04a4444-0000-4000-8000-${String(n).padStart(12, "0")}')::uuid`;

const PIPE = "e04a6666-0000-4000-8000-000000000001";
const ETAPA = "e04a6666-0000-4000-8000-000000000002";
const FONTE = "e04a6666-0000-4000-8000-000000000003";

const DE = "2026-07-13T00:00:00-03:00";
const ATE = "2026-07-15T00:00:00-03:00"; // dois dias: o anterior é 11/07 e 12/07

function painel(opcoes: {
  org?: string;
  numero?: string | null;
  atendente?: string | null;
  ia?: boolean;
  regra24h?: boolean;
  limite?: number;
} = {}): Record<string, unknown> {
  const org = opcoes.org ?? ORG;
  const numero = opcoes.numero ? `'${opcoes.numero}'::uuid` : "null";
  const atendente = opcoes.atendente ? `'${opcoes.atendente}'::uuid` : "null";
  const ia = opcoes.ia ?? true;
  const regra = opcoes.regra24h ?? true;
  const limite = opcoes.limite ?? 900;
  const out = sql(`
    select public.fn_painel_atendimento(
      '${org}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz,
      ${numero}, ${atendente}, ${ia}, ${regra}, ${limite}
    )::text;
  `);
  return JSON.parse(lastLine(out)) as Record<string, unknown>;
}

type Bloco = Record<string, number | null>;
const bloco = (p: Record<string, unknown>, chave: string) => p[chave] as Record<string, unknown>;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${GERENTE}',     'e04a-gerente@invariant.test'),
      ('${ATENDENTE}',   'e04a-atendente@invariant.test'),
      ('${ATENDENTE_B}', 'e04a-atendente-b@invariant.test')
    on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG}',   'e04a-painel',   'E04A Painel Org',   'E04A Painel'),
      ('${ORG_B}', 'e04a-painel-b', 'E04A Painel B Org', 'E04A Painel B')
    on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${GERENTE}',     '${ORG}',   'manager', now()),
      ('${ATENDENTE}',   '${ORG}',   'agent',   now()),
      ('${ATENDENTE_B}', '${ORG_B}', 'agent',   now())
    on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, display_name) values
      ('${S_SEM}',    '${ORG}',   'e04a-sem',    '\\x00'::bytea, 'Sem janela'),
      ('${S_JANELA}', '${ORG}',   'e04a-janela', '\\x00'::bytea, 'Janela 8-18'),
      ('${S_IA}',     '${ORG}',   'e04a-ia',     '\\x00'::bytea, 'Com IA'),
      ('${S_B}',      '${ORG_B}', 'e04a-b',      '\\x00'::bytea, 'Outra org');

    insert into public.channel_knobs (organization_id, channel_session_id, resposta_start_hour, resposta_end_hour) values
      ('${ORG}', '${S_JANELA}', 8, 18),
      ('${ORG}', '${S_IA}',     8, 18);

    -- Agente publicado no número S_IA.
    insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE}', '${ORG}', 'E04A Agente', 'x');
    insert into public.ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status)
      values ('${VERSAO}', '${ORG}', '${AGENTE}', 1, 'x', 'anthropic', 'm', '${S_IA}', 'published');
    update public.ai_agents set published_version_id = '${VERSAO}' where id = '${AGENTE}';

    -- Contatos das conversas: antigos, para não entrarem em "contatos novos".
    insert into public.contacts (id, organization_id, display_name, source, created_at) values
      ${[1, 2, 3, 4, 5].map((n) => `(${CT(n)}, '${ORG}', 'E04A Contato ${n}', 'whatsapp', '2026-01-01T00:00:00Z')`).join(",\n      ")},
      (${CT(9)}, '${ORG_B}', 'E04A Contato B', 'whatsapp', '2026-01-01T00:00:00Z');
    insert into public.contacts (id, organization_id, display_name, source, kind, created_at, source_metadata) values
      (${CT(6)}, '${ORG}', 'E04A Grupo', 'whatsapp_group', 'whatsapp_group', '2026-01-01T00:00:00Z',
       '{"group_chat_id":"e04a-grupo@g.us"}'::jsonb);

    insert into public.conversations
      (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at, assignee_kind, is_group, group_chat_id)
    values
      ('${C1}', '${ORG}', ${CT(1)}, '${S_SEM}',    'claimed', '${ATENDENTE}', '2026-07-13T09:00:00-03:00', 'user', false, null),
      ('${C2}', '${ORG}', ${CT(2)}, '${S_SEM}',    'claimed', '${ATENDENTE}', '2026-07-13T09:00:00-03:00', 'user', false, null),
      ('${C3}', '${ORG}', ${CT(3)}, '${S_SEM}',    'claimed', '${ATENDENTE}', '2026-07-13T09:00:00-03:00', 'user', false, null),
      ('${C4}', '${ORG}', ${CT(4)}, '${S_JANELA}', 'claimed', '${ATENDENTE}', '2026-07-13T09:00:00-03:00', 'user', false, null),
      ('${C5}', '${ORG}', ${CT(5)}, '${S_IA}',     'claimed', '${ATENDENTE}', '2026-07-13T09:00:00-03:00', 'user', false, null),
      ('${C_GRUPO}', '${ORG}', ${CT(6)}, '${S_SEM}', 'open', null, null, null, true, 'e04a-grupo@g.us'),
      ('${C_B}', '${ORG_B}', ${CT(9)}, '${S_B}',   'claimed', '${ATENDENTE_B}', '2026-07-13T09:00:00-03:00', 'user', false, null);

    insert into public.messages
      (organization_id, conversation_id, channel_session_id, contact_id, type, direction, sent_via, sent_by_user_id, sent_at)
    values
      -- C1: o cliente fala duas vezes; a pessoa responde 5 min depois da PRIMEIRA (300 s).
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T10:00:00-03:00'),
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T10:02:00-03:00'),
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'outbound', 'user',            '${ATENDENTE}', '2026-07-13T10:05:00-03:00'),
      -- automação depois da resposta: só volume
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'outbound', 'automation',      null,           '2026-07-13T10:06:00-03:00'),
      -- nova espera; a IA responde em 30 s
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T10:10:00-03:00'),
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'outbound', 'ai',              null,           '2026-07-13T10:10:30-03:00'),
      -- C2: a automação no meio NÃO responde: a espera vai de 11:00 a 11:10 (600 s).
      ('${ORG}', '${C2}', '${S_SEM}', ${CT(2)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T11:00:00-03:00'),
      ('${ORG}', '${C2}', '${S_SEM}', ${CT(2)}, 'text', 'outbound', 'automation',      null,           '2026-07-13T11:01:00-03:00'),
      ('${ORG}', '${C2}', '${S_SEM}', ${CT(2)}, 'text', 'outbound', 'user',            '${ATENDENTE}', '2026-07-13T11:10:00-03:00'),
      -- C3: ninguém respondeu.
      ('${ORG}', '${C3}', '${S_SEM}', ${CT(3)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T12:00:00-03:00'),
      -- C4: janela 8-18, vira o dia. 17:00 → 09:00: 1 h na segunda + 1 h na terça = 7200 s.
      ('${ORG}', '${C4}', '${S_JANELA}', ${CT(4)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T17:00:00-03:00'),
      ('${ORG}', '${C4}', '${S_JANELA}', ${CT(4)}, 'text', 'outbound', 'user',            '${ATENDENTE}', '2026-07-14T09:00:00-03:00'),
      -- C5: noturna no número com IA. 22:00 → 08:30: 37800 s de relógio, 1800 s na janela.
      ('${ORG}', '${C5}', '${S_IA}', ${CT(5)}, 'text', 'inbound',  'external_device', null,           '2026-07-13T22:00:00-03:00'),
      ('${ORG}', '${C5}', '${S_IA}', ${CT(5)}, 'text', 'outbound', 'user',            '${ATENDENTE}', '2026-07-14T08:30:00-03:00'),
      -- Grupo: nada disto pode aparecer.
      ('${ORG}', '${C_GRUPO}', '${S_SEM}', ${CT(6)}, 'text', 'inbound',  'external_device', null,         '2026-07-13T13:00:00-03:00'),
      ('${ORG}', '${C_GRUPO}', '${S_SEM}', ${CT(6)}, 'text', 'outbound', 'user',            '${GERENTE}', '2026-07-13T13:01:00-03:00'),
      -- Período anterior (12/07): uma espera de 60 s.
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'inbound',  'external_device', null,           '2026-07-12T10:00:00-03:00'),
      ('${ORG}', '${C1}', '${S_SEM}', ${CT(1)}, 'text', 'outbound', 'user',            '${ATENDENTE}', '2026-07-12T10:01:00-03:00'),
      -- Outra organização, mesmo dia.
      ('${ORG_B}', '${C_B}', '${S_B}', ${CT(9)}, 'text', 'inbound',  'external_device', null,             '2026-07-13T10:00:00-03:00'),
      ('${ORG_B}', '${C_B}', '${S_B}', ${CT(9)}, 'text', 'outbound', 'user',            '${ATENDENTE_B}', '2026-07-13T10:00:07-03:00');

    -- Contatos novos por origem.
    insert into public.crm_pipelines (id, organization_id, name, slug) values ('${PIPE}', '${ORG}', 'E04A', 'e04a');
    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position) values ('${ETAPA}', '${ORG}', '${PIPE}', 'E04A', 'e04a', 0);
    insert into public.webhook_sources (id, organization_id, name, path_token, default_pipeline_id, default_stage_id)
      values ('${FONTE}', '${ORG}', 'Formulário do site', 'e04a-fonte-token', '${PIPE}', '${ETAPA}');

    insert into public.contacts (id, organization_id, display_name, source, created_at, source_metadata, kind, is_personal) values
      (${CT(11)}, '${ORG}', 'E04A N1', 'whatsapp',  '2026-07-13T10:00:00-03:00', '{}', 'person', false),
      (${CT(12)}, '${ORG}', 'E04A N2', 'whatsapp',  '2026-07-14T10:00:00-03:00', '{}', 'person', false),
      (${CT(13)}, '${ORG}', 'E04A N3', 'meta_ads',  '2026-07-13T11:00:00-03:00', '{}', 'person', false),
      (${CT(14)}, '${ORG}', 'E04A N4', '',          '2026-07-13T12:00:00-03:00', '{}', 'person', false),
      (${CT(15)}, '${ORG}', 'E04A N5', '   ',       '2026-07-13T12:30:00-03:00', '{}', 'person', false),
      (${CT(16)}, '${ORG}', 'E04A N6', 'webhook',   '2026-07-13T13:00:00-03:00', '{"webhook_source_id":"${FONTE}"}', 'person', false),
      (${CT(17)}, '${ORG}', 'E04A N7', 'webhook',   '2026-07-13T13:30:00-03:00', '{"webhook_source_id":"nao-e-uuid"}', 'person', false),
      -- fora: pessoal
      (${CT(18)}, '${ORG}', 'E04A N8', 'manual',    '2026-07-13T14:00:00-03:00', '{}', 'person', true),
      -- período anterior
      (${CT(19)}, '${ORG}', 'E04A N9', 'whatsapp',  '2026-07-12T14:00:00-03:00', '{}', 'person', false),
      -- outra organização
      (${CT(20)}, '${ORG_B}', 'E04A NB', 'meta_ads', '2026-07-13T14:00:00-03:00', '{}', 'person', false);
    -- fora: grupo
    insert into public.contacts (id, organization_id, display_name, source, created_at, kind, source_metadata) values
      (${CT(21)}, '${ORG}', 'E04A G2', 'whatsapp_group', '2026-07-13T15:00:00-03:00', 'whatsapp_group', '{"group_chat_id":"e04a-g2@g.us"}');
    -- fora: mesclado em outro
    insert into public.contacts (id, organization_id, display_name, source, created_at, is_merged_into, merged_at) values
      (${CT(22)}, '${ORG}', 'E04A M1', 'whatsapp', '2026-07-13T16:00:00-03:00', ${CT(11)}, now());

    -- "Agora": estado da fila controlado pelo teste (os triggers de mensagem
    -- carimbam julho; aqui o relógio é o de agora).
    -- 'claimed' (aberta COM dono), e não 'open': voltar a 'open' devolve a
    -- conversa à fila e solta o responsável.
    update public.conversations set status = 'closed', awaiting_since = null where organization_id = '${ORG}' and not is_group;
    update public.conversations set status = 'claimed', awaiting_since = now() - interval '20 minutes' where id = '${C3}';
    update public.conversations set status = 'claimed', awaiting_since = now() - interval '2 minutes'  where id = '${C2}';
    update public.conversations set status = 'claimed', awaiting_since = null where id = '${C4}';
  `);
});

describe("fn_segundos_na_janela", () => {
  const seg = (ini: string, fim: string, domingo = true) =>
    Number(
      lastLine(
        sql(`select public.fn_segundos_na_janela('${ini}'::timestamptz, '${fim}'::timestamptz,
               'America/Sao_Paulo', 8, 18, ${domingo});`),
      ),
    );

  it("conta só o que cai dentro da janela, inclusive virando o dia", () => {
    expect(seg("2026-07-13T10:00:00-03:00", "2026-07-13T10:30:00-03:00")).toBe(1800);
    expect(seg("2026-07-13T19:00:00-03:00", "2026-07-13T20:00:00-03:00")).toBe(0);
    expect(seg("2026-07-13T17:00:00-03:00", "2026-07-14T09:00:00-03:00")).toBe(7200);
  });

  it("domingo fora quando o número não atende domingo", () => {
    expect(seg("2026-07-12T10:00:00-03:00", "2026-07-12T11:00:00-03:00", false)).toBe(0);
    expect(seg("2026-07-12T10:00:00-03:00", "2026-07-12T11:00:00-03:00", true)).toBe(3600);
    // sexta 17h → segunda 9h, sem domingo: 1 h + 10 h (sábado) + 1 h = 12 h
    expect(seg("2026-07-10T17:00:00-03:00", "2026-07-13T09:00:00-03:00", false)).toBe(43200);
  });

  it("intervalo invertido não conta nada", () => {
    expect(seg("2026-07-13T11:00:00-03:00", "2026-07-13T10:00:00-03:00")).toBe(0);
  });
});

describe("fn_painel_atendimento — pareamento de resposta", () => {
  it("cliente que fala duas vezes, IA, automação no meio e conversa sem resposta", () => {
    const p = painel({ numero: S_SEM });
    const r = bloco(p, "resposta");
    // pares: C1 300 s (humano), C1 30 s (IA), C2 600 s (humano)
    expect(r.pares).toBe(3);
    expect(r.media_s).toBeCloseTo(310, 6);
    expect(r.mediana_s).toBeCloseTo(300, 6);
    expect(r.sem_resposta).toBe(1);
    expect((r.ia as Bloco).pares).toBe(1);
    expect((r.ia as Bloco).media_s).toBeCloseTo(30, 6);
    expect((r.humano as Bloco).pares).toBe(2);
    expect((r.humano as Bloco).media_s).toBeCloseTo(450, 6);
    expect((r.por_regra as Bloco).sem_janela).toBe(3);
  });

  it("período anterior sai separado", () => {
    const r = bloco(painel({ numero: S_SEM }), "resposta");
    const ant = r.anterior as Bloco;
    expect(ant.pares).toBe(1);
    expect(ant.media_s).toBeCloseTo(60, 6);
  });

  it("número com janela conta só a janela, virando o dia", () => {
    const r = bloco(painel({ numero: S_JANELA }), "resposta");
    expect(r.pares).toBe(1);
    expect(r.media_s).toBeCloseTo(7200, 6);
    expect((r.por_regra as Bloco).janela).toBe(1);
  });

  it("D5: a mesma conversa noturna — com IA conta 24 h, sem IA conta só a janela", () => {
    const comIa = bloco(painel({ numero: S_IA, ia: true }), "resposta");
    expect(comIa.media_s).toBeCloseTo(37800, 6);
    expect((comIa.por_regra as Bloco)["24h_ia"]).toBe(1);

    const semIa = bloco(painel({ numero: S_IA, ia: false }), "resposta");
    expect(semIa.media_s).toBeCloseTo(1800, 6);
    expect((semIa.por_regra as Bloco).janela).toBe(1);

    const regraDesligada = bloco(painel({ numero: S_IA, ia: true, regra24h: false }), "resposta");
    expect(regraDesligada.media_s).toBeCloseTo(1800, 6);
  });
});

describe("fn_painel_atendimento — volume, grupos e séries", () => {
  it("volume por direção e por remetente, sem o grupo", () => {
    const v = bloco(painel({ numero: S_SEM }), "volume");
    // recebidas: C1 ×3, C2, C3 (o grupo fica fora)
    expect(v.recebidas).toBe(5);
    // enviadas: C1 humano + automação + IA, C2 automação + humano
    expect(v.enviadas).toBe(5);
    expect(v.enviadas_por).toEqual({ ia: 1, humano: 2, automacao: 2, sistema: 0, crm: 0 });
    expect(v.anterior).toEqual({ recebidas: 1, enviadas: 1 });
  });

  it("por hora soma o volume e cai no horário de Brasília", () => {
    const p = painel();
    const horas = p.por_hora as Array<{ hora: number; recebidas: number; enviadas: number }>;
    expect(horas).toHaveLength(24);
    const v = bloco(p, "volume");
    expect(horas.reduce((s, h) => s + h.recebidas, 0)).toBe(v.recebidas);
    expect(horas.reduce((s, h) => s + h.enviadas, 0)).toBe(v.enviadas);
    // 10:00 local: C1 duas recebidas (10:00, 10:10) + 10:02
    expect(horas.find((h) => h.hora === 10)?.recebidas).toBe(3);
  });

  it("por dia: 14 dias terminando no fim do período, somando os pares do período", () => {
    const p = painel();
    const dias = p.por_dia as Array<{ dia: string; pares: number }>;
    expect(dias).toHaveLength(14);
    expect(dias[dias.length - 1]?.dia).toBe("2026-07-14");
    const doPeriodo = dias.filter((d) => d.dia >= "2026-07-13");
    expect(doPeriodo.reduce((s, d) => s + d.pares, 0)).toBe(bloco(p, "resposta").pares);
  });
});

describe("fn_painel_atendimento — 1ª resposta na régua do Desempenho", () => {
  it("bate com fn_attendant_metrics para o mesmo recorte", () => {
    const p = painel();
    const primeira = bloco(p, "primeira_resposta") as Bloco;
    // C1 fica FORA: a 1ª mensagem dela é de 12/07 e a 1ª resposta humana
    // também (10:01 de 12/07), antes do período — é a régua do Desempenho.
    // C2 11:00→11:10 = 600 · C4 17:00→09:00 = 57600 · C5 22:00→08:30 = 37800
    expect(primeira.conversas).toBe(3);
    expect(primeira.media_s).toBeCloseTo((600 + 57600 + 37800) / 3, 6);

    const ref = lastLine(
      sql(`select (a->>'avg_first_response_seconds')::float8
             from jsonb_array_elements(public.fn_attendant_metrics('${ORG}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)->'attendants') a
            where a->>'user_id' = '${ATENDENTE}';`),
    );
    expect(Number(ref)).toBeCloseTo(primeira.media_s as number, 6);
  });
});

describe("fn_painel_atendimento — agora, números e atendentes", () => {
  it("fila de agora por faixa de espera, com o limite configurável", () => {
    const a = bloco(painel(), "agora") as Bloco;
    expect(a.ativas).toBe(3);
    expect(a.aguardando).toBe(2);
    expect(a.ate_5_min).toBe(1);
    expect(a.de_5_a_15_min).toBe(0);
    expect(a.acima_de_15_min).toBe(1);
    expect(a.acima_do_limite).toBe(1);
    expect((bloco(painel({ limite: 60 }), "agora") as Bloco).acima_do_limite).toBe(2);
  });

  it("por número traz a regra de horário de cada um", () => {
    const linhas = painel().por_numero as Array<Record<string, unknown>>;
    const por = Object.fromEntries(linhas.map((l) => [l.channel_session_id, l]));
    expect(por[S_SEM]?.regra).toBe("sem_janela");
    expect(por[S_JANELA]?.regra).toBe("janela");
    expect(por[S_IA]?.regra).toBe("24h_ia");
    expect(por[S_SEM]?.aguardando).toBe(2);
    expect(por[S_B]).toBeUndefined();
  });

  it("por atendente atribui a resposta de pessoa a quem a escreveu, e a IA sai à parte", () => {
    const p = painel();
    const linhas = p.por_atendente as Array<Record<string, unknown>>;
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.user_id).toBe(ATENDENTE);
    expect(linhas[0]?.pares).toBe(4); // C1, C2, C4, C5
    expect(linhas[0]?.aguardando).toBe(2);
    const ia = bloco(p, "ia") as Bloco;
    expect(ia.pares).toBe(1);
    expect(ia.enviadas).toBe(1);
  });
});

describe("fn_painel_atendimento — contatos novos por origem", () => {
  it("vazio fica vazio, webhook ganha o nome da fonte, grupo/pessoal/mesclado ficam fora", () => {
    const origens = painel().origens as Array<{ origem: string; atual: number; anterior: number }>;
    const por = Object.fromEntries(origens.map((o) => [o.origem, o]));
    expect(por.whatsapp).toEqual({ origem: "whatsapp", atual: 2, anterior: 1 });
    expect(por.meta_ads?.atual).toBe(1);
    expect(por[""]?.atual).toBe(2);
    expect(por["webhook:Formulário do site"]?.atual).toBe(1);
    expect(por.webhook?.atual).toBe(1); // id que não é de fonte nenhuma: fica "webhook"
    expect(por.whatsapp_group).toBeUndefined();
    expect(por.manual).toBeUndefined();
    expect(origens.reduce((s, o) => s + o.atual, 0)).toBe(7);
  });
});

describe("fn_painel_atendimento — isolamento e permissão", () => {
  it("cada organização só vê o que é dela", () => {
    const b = painel({ org: ORG_B });
    expect(bloco(b, "volume").recebidas).toBe(1);
    expect(bloco(b, "resposta").pares).toBe(1);
    expect(bloco(b, "resposta").media_s).toBeCloseTo(7, 6);
    const origensB = b.origens as Array<{ origem: string; atual: number }>;
    expect(origensB).toEqual([{ origem: "meta_ads", atual: 1, anterior: 0 }]);

    const a = painel();
    expect((a.por_numero as Array<Record<string, unknown>>).some((l) => l.channel_session_id === S_B)).toBe(false);
  });

  it("filtrar o número de OUTRA organização não devolve nada dela", () => {
    const p = painel({ numero: S_B });
    expect(bloco(p, "volume").recebidas).toBe(0);
    expect(bloco(p, "resposta").pares).toBe(0);
    expect(p.por_numero).toEqual([]);
  });

  it("só o service_role executa a função do painel", () => {
    const quem = sql(`
      select string_agg(r, ',' order by r) from (
        select r from unnest(array['anon','authenticated','service_role']) r
         where has_function_privilege(r,
           'public.fn_painel_atendimento(uuid,timestamptz,timestamptz,uuid,uuid,boolean,boolean,integer)', 'execute')
      ) x;
    `);
    expect(lastLine(quem)).toBe("service_role");
  });
});
