-- manifest: **Índices do painel de atendimento (fork Elite, Spec 04, D10).** Dois índices, nenhum dado alterado. (1) `idx_messages_org_direction_sent` em `messages (organization_id, direction, sent_at)` — o MESMO nome e a MESMA definição da migration 0133 do produto, que nunca chegou ao `baseline.sql` (o baseline só o cita em comentário, `fn_attendant_metrics`/`fn_channel_metrics` contam com ele e as instalações pelo kit não o têm). (2) `idx_contacts_org_created` em `contacts (organization_id, created_at)` — o recorte de "contatos novos no período" do quadro Canal com mais leads. `create index if not exists`: idempotente e inofensivo onde o 0133 já foi aplicado.

-- O painel corta mensagens pela janela (organização + data) e as duas
-- direções entram com `direction in ('inbound','outbound')`, que o btree
-- resolve como duas varreduras de faixa no mesmo índice.
create index if not exists idx_messages_org_direction_sent
  on public.messages (organization_id, direction, sent_at);

-- "Contatos novos no período": organização + data de criação.
create index if not exists idx_contacts_org_created
  on public.contacts (organization_id, created_at);
