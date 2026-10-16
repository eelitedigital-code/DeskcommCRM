-- manifest: [Elite] company_people.saiu_em (quem saiu da equipe deixa de ter o nome exibido, a venda continua da empresa) + companies.custom_fields (campos próprios da empresa, definidos em organizations.settings.company_fields)
--
-- 9001 — migration do FORK da Elite Digital (faixa 9xxx reservada para não
-- colidir com a numeração do produto, que segue em 06xx). Timestamp 2099 para
-- ordenar depois de qualquer migration do produto.
--
-- Duas colunas ADITIVAS, sem tabela nova:
--
--   company_people.saiu_em  — nulo = a pessoa está na equipe da empresa;
--                             preenchido = saiu. "Remover da equipe" grava esta
--                             data em vez de apagar a linha: o vínculo sustenta o
--                             histórico de vendas da empresa (a venda é sempre
--                             atribuída pela pessoa, nunca direto à empresa).
--   companies.custom_fields — valores dos campos próprios da EMPRESA, no mesmo
--                             molde de contacts.custom_fields (0211), inclusive a
--                             constraint de objeto. Dado da pessoa jurídica: a
--                             anonimização de contato não o alcança, como não
--                             alcança razão social e CNPJ (ver 0449).
--
-- LGPD: a redação da camada B2B na anonimização JÁ EXISTE desde a 0449
-- (trg_redigir_b2b_ao_anonimizar → fn_redigir_b2b_do_contato_anonimizado):
-- troca people.full_name, limpa e-mail/notas e company_people.job_title,
-- department e notes, preservando o vínculo e as vendas. Esta migration não
-- mexe nela; `saiu_em` é preservado pela mesma regra (é a data do fato, não
-- dado do titular).
--
-- Idempotente: reaplicar não quebra e nenhum dado se perde.

alter table public.company_people
  add column if not exists saiu_em timestamptz;

comment on column public.company_people.saiu_em is
  'Quando a pessoa saiu da equipe da empresa. Nulo = ativa. Preenchido: o nome deixa de ser exibido no painel da empresa (fica cargo + final do número) e a venda continua contando para a empresa.';

alter table public.companies
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.companies.custom_fields is
  'Valores de campos próprios da empresa (e links da loja: link_<tipo>). As definições são declaradas em organizations.settings.company_fields[].';

update public.companies
   set custom_fields = '{}'::jsonb
 where custom_fields is null
    or jsonb_typeof(custom_fields) <> 'object';

alter table public.companies
  drop constraint if exists companies_custom_fields_object;
alter table public.companies
  add constraint companies_custom_fields_object
  check (jsonb_typeof(custom_fields) = 'object');
