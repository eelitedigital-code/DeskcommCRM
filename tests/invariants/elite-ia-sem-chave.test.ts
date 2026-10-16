import { beforeAll, describe, expect, it } from "vitest";

import { IA_SEM_CHAVE, avisoDeIaSemChave } from "@/lib/event-log/ia-sem-chave";

import { GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

/**
 * IA SEM CHAVE — UM aviso de atenção por organização (Especificação 03, L2,
 * fork Elite). Roda só via `pnpm test:db`.
 *
 * O aviso usa o `kind` `event_dead` com título fixo e severidade `warn`; quem
 * garante "no máximo um aberto por organização" é o índice único parcial
 * `agent_inbox_event_dead_aberto_unico` (organization_id, kind, title). Aqui se
 * prova, no banco que o cliente tem:
 *   1. a segunda abertura na MESMA organização é recusada (23505) — fotos,
 *      áudios e conversas seguintes não empilham avisos;
 *   2. outra organização abre o seu, independente (isolamento);
 *   3. resolvido o aviso, o próximo volta a abrir (rearme);
 *   4. a severidade cabe no CHECK (`warn`) — um valor fora dele seria recusado
 *      e o aviso nunca abriria.
 * E que o interruptor da IA de uma organização não liga nem desliga a outra.
 */
const ORG_B = "e1a00000-0000-4000-8000-00000000000b";

function abrir(org: string): string {
  const { title, body } = avisoDeIaSemChave("org sem credencial LLM utilizável — teste");
  const t = title.replace(/'/g, "''");
  const b = body.replace(/'/g, "''");
  return `insert into public.agent_inbox_items (organization_id, kind, severity, title, body)
          values ('${org}', 'event_dead', 'warn', '${t}', '${b}');`;
}

beforeAll(() => {
  seedGov();
  sql(`insert into public.organizations (id, slug, legal_name, display_name)
         values ('${ORG_B}', 'elite-ia-b', 'IA B', 'IA B') on conflict (id) do nothing;`);
});

describe("um aviso de IA sem chave por organização", () => {
  it("a primeira abertura entra, como atenção (warn)", () => {
    sql(abrir(GOV_ORG));
    expect(
      lastLine(
        sql(`select count(*) || '|' || min(severity) from public.agent_inbox_items
               where organization_id='${GOV_ORG}' and title='${IA_SEM_CHAVE.titulo}' and status='open';`),
      ),
    ).toBe("1|warn");
  });

  it("a segunda, na mesma organização, é recusada pelo índice único", () => {
    expect(() => sql(abrir(GOV_ORG))).toThrow(/agent_inbox_event_dead_aberto_unico|duplicate key/);
  });

  it("outra organização abre o seu (isolamento)", () => {
    sql(abrir(ORG_B));
    expect(
      lastLine(
        sql(`select count(*) from public.agent_inbox_items
               where title='${IA_SEM_CHAVE.titulo}' and status='open';`),
      ),
    ).toBe("2");
  });

  it("resolvido, o aviso rearma: o próximo volta a abrir", () => {
    sql(`update public.agent_inbox_items set status='resolved'
           where organization_id='${GOV_ORG}' and title='${IA_SEM_CHAVE.titulo}';`);
    sql(abrir(GOV_ORG));
    expect(
      lastLine(
        sql(`select count(*) from public.agent_inbox_items
               where organization_id='${GOV_ORG}' and title='${IA_SEM_CHAVE.titulo}' and status='open';`),
      ),
    ).toBe("1");
  });
});

describe("o interruptor da IA é da organização", () => {
  it("desligar em A não desliga em B", () => {
    sql(`update public.organizations set settings = coalesce(settings,'{}'::jsonb) || '{"ia":{"enabled":false}}'::jsonb
           where id='${GOV_ORG}';`);
    expect(
      lastLine(
        sql(`select coalesce(settings->'ia'->>'enabled','(ausente)') from public.organizations where id='${ORG_B}';`),
      ),
    ).toBe("(ausente)");
  });
});
