-- manifest: **Painel de atendimento (fork Elite, Spec 04): o cálculo num lugar só, no banco.** Duas funções, nenhuma tabela nem coluna. `fn_segundos_na_janela` conta quantos segundos de um intervalo caem dentro da janela diária [hora_ini, hora_fim) no fuso dado (domingo opcional). `fn_painel_atendimento` devolve, já agregado, tudo o que a tela do Dashboard mostra: volume (recebidas/enviadas, por remetente), tempo de resposta AO LONGO da conversa (pareamento por janela: o relógio corre da primeira mensagem do cliente sem resposta até a primeira resposta de IA ou de pessoa; automação, sistema e `crm` não respondem nem zeram a espera), média e mediana, IA x pessoa, a 1ª resposta na régua da tela Desempenho, a fila de agora por faixa de espera, volume por hora local, 14 dias de tempo médio, a quebra por número e por atendente, e os contatos novos por origem. A janela que conta é a de RESPOSTA do número (`channel_knobs.resposta_*`, herdando a de disparo como o motor faz); número sem janela configurada conta 24 h; número com agente de IA no ar conta 24 h quando a organização usa IA e a regra está ligada. Grupos ficam fora (D8). SECURITY DEFINER só para o service_role: a rota resolve a organização da sessão e decide o que cada papel vê.

-- ─── segundos dentro da janela diária ──────────────────────────────────────
--
-- Cada dia LOCAL tocado pelo intervalo contribui com a sobreposição entre o
-- intervalo e [dia + hora_ini, dia + hora_fim). A conversão volta para
-- timestamptz pelo próprio fuso, então horário de verão entra certo.
-- Janela inválida (início >= fim, fora de 0..24) devolve 0: quem chama trata
-- isso como "sem janela" ANTES de chamar.
create or replace function public.fn_segundos_na_janela(
  p_ini timestamptz,
  p_fim timestamptz,
  p_fuso text,
  p_hora_ini integer,
  p_hora_fim integer,
  p_conta_domingo boolean default true
) returns double precision
language sql stable
set search_path = public
as $$
  select coalesce(sum(
           greatest(0::double precision, extract(epoch from (
             least(p_fim, (d.dia + make_interval(hours => p_hora_fim)) at time zone p_fuso)
             - greatest(p_ini, (d.dia + make_interval(hours => p_hora_ini)) at time zone p_fuso)
           ))::double precision)
         ), 0)::double precision
    from generate_series(
           date_trunc('day', p_ini at time zone p_fuso),
           date_trunc('day', p_fim at time zone p_fuso),
           interval '1 day'
         ) as d(dia)
   where p_fim > p_ini
     and p_hora_ini >= 0 and p_hora_fim <= 24 and p_hora_ini < p_hora_fim
     and (p_conta_domingo or extract(isodow from d.dia) <> 7);
$$;

revoke execute on function public.fn_segundos_na_janela(timestamptz, timestamptz, text, integer, integer, boolean) from public, anon;
grant  execute on function public.fn_segundos_na_janela(timestamptz, timestamptz, text, integer, integer, boolean) to authenticated, service_role;

-- ─── o painel ──────────────────────────────────────────────────────────────
create or replace function public.fn_painel_atendimento(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_numero uuid default null,
  p_atendente uuid default null,
  p_ia_ligada boolean default true,
  p_24h_com_ia boolean default true,
  p_limite_espera_s integer default 900
) returns jsonb
language sql stable
security definer
set search_path = public
as $$
  with
  -- O fuso da organização, validado: um nome que o Postgres não conhece
  -- derrubaria a consulta inteira no `at time zone`.
  base as (
    select f.fuso,
           p_from - (p_to - p_from) as de_ant,
           (date_trunc('day', (p_to - interval '1 microsecond') at time zone f.fuso) - interval '13 days')
             at time zone f.fuso as de_14
      from (
        select coalesce((
          select o.timezone from public.organizations o
           where o.id = p_org
             and exists (select 1 from pg_timezone_names z where z.name = o.timezone)
        ), 'America/Sao_Paulo') as fuso
      ) f
  ),
  -- Lê mensagens desde 30 dias antes do recorte mais antigo, para achar a
  -- mensagem do cliente que abriu uma espera respondida dentro do período.
  leitura as (
    select least(b.de_ant, b.de_14) - interval '30 days' as desde from base b
  ),

  -- ─── números: a regra de horário de cada um (D11) ───────────────────────
  numeros as (
    select cs.id,
           coalesce(cs.phone_number, cs.display_name, cs.waha_session_name) as nome,
           cs.archived_at is not null as arquivado,
           coalesce(k.resposta_start_hour, k.window_start_hour)::int as hora_ini,
           coalesce(k.resposta_end_hour, k.window_end_hour)::int as hora_fim,
           coalesce(k.allow_sunday, true) as domingo,
           coalesce(
             (select btrim(k.timezone) from pg_timezone_names z where z.name = btrim(k.timezone) limit 1),
             (select b.fuso from base b)
           ) as fuso,
           -- "Há agente de IA no ar neste número": o portão do dreno
           -- (`lib/ai/agents/quem-atende-a-sessao.ts`) sem os pausados —
           -- versão publicada no número, ou roteador ativo no número com
           -- fallback ou membro que pode executar.
           (
             exists (
               select 1 from public.ai_agents a
               join public.ai_agent_versions v on v.id = a.published_version_id
               where a.organization_id = p_org and a.archived_at is null and a.paused_at is null
                 and v.status = 'published' and v.channel_session_id = cs.id
             )
             or exists (
               select 1 from public.ai_routers r
               where r.organization_id = p_org and r.is_active and r.channel_session_id = cs.id
                 and (
                   exists (
                     select 1 from public.ai_agents fa
                     join public.ai_agent_versions fv on fv.id = fa.published_version_id
                     where fa.id = r.fallback_agent_id and fa.organization_id = p_org
                       and fa.archived_at is null and fa.paused_at is null and fv.status = 'published'
                   )
                   or exists (
                     select 1 from public.ai_router_members m
                     join public.ai_agents ma on ma.id = m.agent_id
                     join public.ai_agent_versions mv on mv.id = ma.published_version_id
                     where m.router_id = r.id and ma.organization_id = p_org
                       and ma.archived_at is null and ma.paused_at is null and mv.status = 'published'
                   )
                 )
             )
           ) as ia_no_ar
      from public.channel_sessions cs
      left join public.channel_knobs k
        on k.organization_id = p_org and k.channel_session_id = cs.id
     where cs.organization_id = p_org
  ),
  numeros_regra as (
    select n.*,
           case
             when p_ia_ligada and p_24h_com_ia and n.ia_no_ar then '24h_ia'
             when n.hora_ini is null or n.hora_fim is null
               or n.hora_ini < 0 or n.hora_fim > 24 or n.hora_ini >= n.hora_fim then 'sem_janela'
             else 'janela'
           end as regra
      from numeros n
  ),

  -- ─── conversas individuais no recorte (D8: grupo fica fora) ─────────────
  conv as (
    select c.id, c.channel_session_id, c.assigned_to_user_id
      from public.conversations c
     where c.organization_id = p_org
       and c.is_group = false
       and (p_numero is null or c.channel_session_id = p_numero)
       and (p_atendente is null or c.assigned_to_user_id = p_atendente)
  ),

  -- ─── mensagens, com o papel de cada uma no pareamento (D12) ─────────────
  -- cliente = recebida; ia = sent_via 'ai'; humano = 'user' ou
  -- 'external_device'. automation, system e crm ficam com papel nulo: entram
  -- no volume, mas não respondem nem zeram a espera.
  msgs as (
    select m.id, m.conversation_id, c.channel_session_id, m.direction, m.sent_via,
           m.sent_at, m.sent_by_user_id, c.assigned_to_user_id,
           case
             when m.direction = 'inbound' then 'cliente'
             when m.sent_via = 'ai' then 'ia'
             when m.sent_via in ('user', 'external_device') then 'humano'
           end as papel
      from public.messages m
      join conv c on c.id = m.conversation_id
     where m.organization_id = p_org
       and m.direction in ('inbound', 'outbound')
       and m.sent_at >= (select l.desde from leitura l)
       and m.sent_at < p_to
       and m.type not in ('reaction', 'system')
  ),

  -- ─── o pareamento ───────────────────────────────────────────────────────
  -- `g` conta as respostas já vistas na conversa. Toda mensagem do cliente
  -- com o mesmo `g` pertence à MESMA espera, e a espera começa na primeira
  -- delas (cliente que fala duas vezes: o relógio corre desde a primeira).
  -- A resposta que encerra a espera de `g` é a mensagem não-cliente com
  -- `g + 1` cuja anterior é do cliente.
  ordenadas as (
    select x.*,
           lag(x.papel) over w_ord as papel_ant,
           count(*) filter (where x.papel <> 'cliente') over w_acum as g
      from msgs x
     where x.papel is not null
    window w_ord as (partition by x.conversation_id order by x.sent_at, x.id),
           w_acum as (partition by x.conversation_id order by x.sent_at, x.id
                      rows between unbounded preceding and current row)
  ),
  esperas as (
    select o.conversation_id, o.g, min(o.sent_at) as desde
      from ordenadas o
     where o.papel = 'cliente'
     group by o.conversation_id, o.g
  ),
  respostas as (
    select o.conversation_id, o.g, o.sent_at as respondida_em, o.papel as quem, o.sent_by_user_id
      from ordenadas o
     where o.papel in ('ia', 'humano') and o.papel_ant = 'cliente'
  ),
  pares as (
    select r.conversation_id,
           c.channel_session_id,
           r.quem,
           -- Quem respondeu, para a linha "por atendente": o autor quando a
           -- mensagem tem autor; senão o responsável pela conversa (resposta
           -- pelo celular conectado não carrega usuário).
           case when r.quem = 'humano' then coalesce(r.sent_by_user_id, c.assigned_to_user_id) end as atendente,
           e.desde,
           r.respondida_em,
           coalesce(n.regra, 'sem_janela') as regra,
           case
             when n.regra = 'janela'
               then public.fn_segundos_na_janela(e.desde, r.respondida_em, n.fuso, n.hora_ini, n.hora_fim, n.domingo)
             else extract(epoch from (r.respondida_em - e.desde))::double precision
           end as segundos
      from respostas r
      join esperas e on e.conversation_id = r.conversation_id and e.g = r.g - 1
      join conv c on c.id = r.conversation_id
      left join numeros_regra n on n.id = c.channel_session_id
  ),
  pares_atuais as (
    select * from pares p where p.respondida_em >= p_from and p.respondida_em < p_to
  ),
  pares_anteriores as (
    select * from pares p where p.respondida_em >= (select b.de_ant from base b) and p.respondida_em < p_from
  ),
  -- Espera aberta no período que ninguém respondeu até o fim dele.
  sem_resposta as (
    select e.conversation_id
      from esperas e
     where e.desde >= p_from and e.desde < p_to
       and not exists (
         select 1 from respostas r where r.conversation_id = e.conversation_id and r.g = e.g + 1
       )
  ),

  -- ─── volume ─────────────────────────────────────────────────────────────
  vol as (
    select
      count(*) filter (where m.sent_at >= p_from and m.direction = 'inbound') as recebidas,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound') as enviadas,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound' and m.sent_via = 'ai') as env_ia,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound' and m.sent_via in ('user', 'external_device')) as env_humano,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound' and m.sent_via = 'automation') as env_automacao,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound' and m.sent_via = 'system') as env_sistema,
      count(*) filter (where m.sent_at >= p_from and m.direction = 'outbound' and m.sent_via = 'crm') as env_crm,
      count(*) filter (where m.sent_at < p_from and m.direction = 'inbound') as recebidas_ant,
      count(*) filter (where m.sent_at < p_from and m.direction = 'outbound') as enviadas_ant
      from msgs m
     where m.sent_at >= (select b.de_ant from base b)
  ),

  -- ─── a 1ª resposta, na régua da tela Desempenho ─────────────────────────
  -- A MESMA fórmula de `fn_attendant_metrics` (bloco `ttfr`): da 1ª mensagem
  -- recebida à 1ª resposta com autor humano, uma vez por conversa atribuída,
  -- com a resposta dentro do período. Aqui sem a RLS de quem pergunta e
  -- sem grupos.
  primeira as (
    select count(*) as conversas,
           avg(extract(epoch from (fr.first_human_out - fr.first_in)))::double precision as media_s
      from public.conversations c
      join (
        select distinct m.conversation_id
          from public.messages m
         where m.organization_id = p_org
           and m.direction = 'outbound'
           and m.sent_by_user_id is not null
           and m.sent_at >= p_from and m.sent_at < p_to
      ) k on k.conversation_id = c.id
      cross join lateral (
        select min(m.sent_at) filter (where m.direction = 'inbound') as first_in,
               min(m.sent_at) filter (where m.direction = 'outbound' and m.sent_by_user_id is not null) as first_human_out
          from public.messages m
         where m.conversation_id = c.id
      ) fr
     where c.organization_id = p_org
       and c.is_group = false
       and c.assigned_to_user_id is not null
       and (p_numero is null or c.channel_session_id = p_numero)
       and (p_atendente is null or c.assigned_to_user_id = p_atendente)
       and fr.first_in is not null
       and fr.first_human_out is not null
       and fr.first_human_out > fr.first_in
       and fr.first_human_out >= p_from and fr.first_human_out < p_to
  ),

  -- ─── agora (não depende do período) ─────────────────────────────────────
  -- Aberta = status fora dos encerrados (`STATUS_ENCERRADOS`,
  -- lib/inbox/comando-da-conversa.ts). Aguardando = `awaiting_since` (a
  -- mensagem mais antiga do cliente sem resposta, migration 0267). A espera
  -- de agora é de relógio, a mesma da pílula "Aguardando há…" do Inbox.
  abertas as (
    select c.id, c.channel_session_id, c.assigned_to_user_id, c.awaiting_since,
           public.comando_da_conversa(c) as comando
      from public.conversations c
     where c.organization_id = p_org
       and c.is_group = false
       and c.status not in ('closed', 'archived', 'resolved')
       and (p_numero is null or c.channel_session_id = p_numero)
       and (p_atendente is null or c.assigned_to_user_id = p_atendente)
  ),
  agora as (
    select count(*) as ativas,
           count(*) filter (where a.awaiting_since is not null) as aguardando,
           count(*) filter (where a.awaiting_since is not null
                              and now() - a.awaiting_since > make_interval(secs => greatest(p_limite_espera_s, 0))) as acima_do_limite,
           count(*) filter (where a.awaiting_since is not null and now() - a.awaiting_since <= interval '5 minutes') as ate_5_min,
           count(*) filter (where a.awaiting_since is not null and now() - a.awaiting_since > interval '5 minutes'
                              and now() - a.awaiting_since <= interval '15 minutes') as de_5_a_15_min,
           count(*) filter (where a.awaiting_since is not null and now() - a.awaiting_since > interval '15 minutes') as acima_de_15_min
      from abertas a
  ),

  -- ─── séries ─────────────────────────────────────────────────────────────
  por_hora as (
    select h.hora,
           count(m.id) filter (where m.direction = 'inbound') as recebidas,
           count(m.id) filter (where m.direction = 'outbound') as enviadas
      from generate_series(0, 23) as h(hora)
      left join msgs m
        on m.sent_at >= p_from
       and extract(hour from m.sent_at at time zone (select b.fuso from base b))::int = h.hora
     group by h.hora
  ),
  por_dia as (
    select d.dia::date as dia,
           count(p.segundos) as pares,
           avg(p.segundos) as media_s
      from base b
      cross join lateral generate_series(
        date_trunc('day', b.de_14 at time zone b.fuso),
        date_trunc('day', (p_to - interval '1 microsecond') at time zone b.fuso),
        interval '1 day'
      ) as d(dia)
      left join pares p
        on p.respondida_em >= b.de_14 and p.respondida_em < p_to
       and date_trunc('day', p.respondida_em at time zone b.fuso) = d.dia
     group by d.dia
  ),

  -- ─── por número ─────────────────────────────────────────────────────────
  num_vol as (
    select m.channel_session_id,
           count(*) filter (where m.direction = 'inbound') as recebidas,
           count(*) filter (where m.direction = 'outbound') as enviadas
      from msgs m where m.sent_at >= p_from
     group by m.channel_session_id
  ),
  num_resp as (
    select p.channel_session_id, count(*) as pares, avg(p.segundos) as media_s,
           percentile_cont(0.5) within group (order by p.segundos) as mediana_s
      from pares_atuais p group by p.channel_session_id
  ),
  num_fila as (
    select a.channel_session_id, count(*) as aguardando
      from abertas a where a.awaiting_since is not null
     group by a.channel_session_id
  ),

  -- ─── por atendente (e a IA como linha própria) ──────────────────────────
  at_env as (
    select coalesce(m.sent_by_user_id, m.assigned_to_user_id) as user_id, count(*) as enviadas
      from msgs m
     where m.sent_at >= p_from and m.papel = 'humano'
       and coalesce(m.sent_by_user_id, m.assigned_to_user_id) is not null
     group by 1
  ),
  at_resp as (
    select p.atendente as user_id, count(*) as pares, avg(p.segundos) as media_s,
           percentile_cont(0.5) within group (order by p.segundos) as mediana_s
      from pares_atuais p
     where p.quem = 'humano' and p.atendente is not null
     group by p.atendente
  ),
  at_fila as (
    select a.assigned_to_user_id as user_id, count(*) as aguardando
      from abertas a
     where a.awaiting_since is not null and a.assigned_to_user_id is not null
     group by a.assigned_to_user_id
  ),
  atendentes as (
    select user_id from at_env union select user_id from at_resp union select user_id from at_fila
  ),

  -- ─── contatos novos por origem (D9) ─────────────────────────────────────
  -- Fonte de webhook com nome vira `webhook:<nome da fonte>`, lido da fonte
  -- cadastrada em Webhooks; a origem gravada no contato nunca é reescrita.
  -- Participante de grupo e contato pessoal ficam fora; anonimizado conta.
  leads as (
    select case
             when ct.source = 'webhook' and ws.name is not null then 'webhook:' || ws.name
             else coalesce(nullif(btrim(ct.source), ''), '')
           end as origem,
           ct.created_at >= p_from as atual
      from public.contacts ct
      left join public.webhook_sources ws
        on ws.organization_id = p_org
       and ws.id::text = ct.source_metadata ->> 'webhook_source_id'
     where ct.organization_id = p_org
       and ct.created_at >= (select b.de_ant from base b)
       and ct.created_at < p_to
       and ct.is_merged_into is null
       and ct.kind <> 'whatsapp_group'
       and coalesce(ct.source, '') <> 'whatsapp_group'
       and ct.is_personal = false
  )

  select jsonb_build_object(
    'periodo', (select jsonb_build_object('de', p_from, 'ate', p_to, 'de_anterior', b.de_ant, 'fuso', b.fuso) from base b),
    'volume', (
      select jsonb_build_object(
        'recebidas', v.recebidas,
        'enviadas', v.enviadas,
        'enviadas_por', jsonb_build_object(
          'ia', v.env_ia, 'humano', v.env_humano, 'automacao', v.env_automacao,
          'sistema', v.env_sistema, 'crm', v.env_crm),
        'anterior', jsonb_build_object('recebidas', v.recebidas_ant, 'enviadas', v.enviadas_ant)
      ) from vol v
    ),
    'resposta', jsonb_build_object(
      'pares', (select count(*) from pares_atuais),
      'media_s', (select avg(segundos) from pares_atuais),
      'mediana_s', (select percentile_cont(0.5) within group (order by segundos) from pares_atuais),
      'sem_resposta', (select count(*) from sem_resposta),
      'ia', (select jsonb_build_object('pares', count(*), 'media_s', avg(segundos),
                    'mediana_s', percentile_cont(0.5) within group (order by segundos))
               from pares_atuais where quem = 'ia'),
      'humano', (select jsonb_build_object('pares', count(*), 'media_s', avg(segundos),
                    'mediana_s', percentile_cont(0.5) within group (order by segundos))
               from pares_atuais where quem = 'humano'),
      'por_regra', (select jsonb_build_object(
                      'janela', count(*) filter (where regra = 'janela'),
                      'sem_janela', count(*) filter (where regra = 'sem_janela'),
                      '24h_ia', count(*) filter (where regra = '24h_ia'))
                    from pares_atuais),
      'anterior', (select jsonb_build_object('pares', count(*), 'media_s', avg(segundos),
                     'mediana_s', percentile_cont(0.5) within group (order by segundos))
                   from pares_anteriores)
    ),
    'primeira_resposta', (select jsonb_build_object('conversas', p.conversas, 'media_s', p.media_s) from primeira p),
    'agora', (select to_jsonb(a) from agora a),
    'por_hora', (select jsonb_agg(jsonb_build_object('hora', h.hora, 'recebidas', h.recebidas, 'enviadas', h.enviadas)
                                  order by h.hora) from por_hora h),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'pares', d.pares, 'media_s', d.media_s)
                                          order by d.dia), '[]'::jsonb) from por_dia d),
    'por_numero', coalesce((
      select jsonb_agg(jsonb_build_object(
               'channel_session_id', n.id,
               'nome', n.nome,
               'arquivado', n.arquivado,
               'regra', n.regra,
               'hora_ini', n.hora_ini,
               'hora_fim', n.hora_fim,
               'recebidas', coalesce(v.recebidas, 0),
               'enviadas', coalesce(v.enviadas, 0),
               'pares', coalesce(r.pares, 0),
               'media_s', r.media_s,
               'mediana_s', r.mediana_s,
               'aguardando', coalesce(f.aguardando, 0)
             ) order by coalesce(v.recebidas, 0) + coalesce(v.enviadas, 0) desc, n.id)
        from numeros_regra n
        left join num_vol v on v.channel_session_id = n.id
        left join num_resp r on r.channel_session_id = n.id
        left join num_fila f on f.channel_session_id = n.id
       where (p_numero is null or n.id = p_numero)
         and (not n.arquivado or v.channel_session_id is not null or f.channel_session_id is not null)
    ), '[]'::jsonb),
    'por_atendente', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quem', 'humano',
               'user_id', u.user_id,
               'enviadas', coalesce(e.enviadas, 0),
               'pares', coalesce(r.pares, 0),
               'media_s', r.media_s,
               'mediana_s', r.mediana_s,
               'aguardando', coalesce(f.aguardando, 0)
             ) order by coalesce(e.enviadas, 0) desc, u.user_id)
        from atendentes u
        left join at_env e on e.user_id = u.user_id
        left join at_resp r on r.user_id = u.user_id
        left join at_fila f on f.user_id = u.user_id
    ), '[]'::jsonb),
    'ia', (
      select jsonb_build_object(
        'enviadas', (select count(*) from msgs m where m.sent_at >= p_from and m.papel = 'ia'),
        'pares', count(*),
        'media_s', avg(p.segundos),
        'mediana_s', percentile_cont(0.5) within group (order by p.segundos),
        'aguardando', (select count(*) from abertas a where a.awaiting_since is not null and a.comando = 'automatico')
      ) from pares_atuais p where p.quem = 'ia'
    ),
    'origens', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'atual', o.atual, 'anterior', o.anterior)
                       order by o.atual desc, o.origem)
        from (
          select l.origem,
                 count(*) filter (where l.atual) as atual,
                 count(*) filter (where not l.atual) as anterior
            from leads l group by l.origem
        ) o
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.fn_painel_atendimento(uuid, timestamptz, timestamptz, uuid, uuid, boolean, boolean, integer) from public, anon, authenticated;
grant  execute on function public.fn_painel_atendimento(uuid, timestamptz, timestamptz, uuid, uuid, boolean, boolean, integer) to service_role;
