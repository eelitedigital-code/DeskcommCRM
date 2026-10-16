---
impacto: exige_acao
secao: adicionado
titulo: Empresas ganham equipe e painel de vendas, e cada empresa liga ou desliga o recurso
---

Na ficha de uma empresa, a seção **Equipe** liga contatos à empresa — com cargo, quem decide a compra e o contato principal — e o painel **Vendas da empresa** soma o que cada pessoa da equipe fechou: total comprado, negócios abertos, ganhos e perdidos, pessoas na equipe e desde quando a empresa é cliente, com a lista de cada venda e de quem comprou. Quem sai da empresa é marcado com **Marcar como saiu da empresa**: nada é apagado, a venda continua contando para a empresa e o nome deixa de aparecer (fica o cargo e o final do número). Quem foi anonimizado pela LGPD continua somando, sem nome, cargo nem número.

Na ficha do contato, a Visão geral mostra a empresa e o cargo, com link para a ficha da empresa.

Cadastrar uma empresa pede só o **nome**. O CNPJ é opcional: com ele, a consulta completa razão social, endereço, CNAE e porte; se a consulta falhar, a empresa é salva com o que há, e a ficha mostra o motivo e o botão **Consultar CNPJ de novo**.

A empresa tem links próprios (Instagram, site, Shopee, Mercado Livre, TikTok Shop…), independentes dos do contato, e campos próprios em **Configurações › Campos da empresa**. Shopee, Mercado Livre e TikTok Shop também entram nos links do contato.

## Requer atenção

**Aplique o `baseline.sql` antes de trocar a imagem.** Esta versão acrescenta duas colunas ao banco (`company_people.saiu_em` e `companies.custom_fields`, migration 9001). São aditivas e reaplicar não apaga nada, mas a imagem nova lê a coluna `custom_fields`: subir a imagem antes do banco quebra as telas de empresa.

**Empresas passa a ser ligado por empresa e nasce desligado.** Com o módulo "Empresas e pessoas" ligado na instalação, cada organização liga o recurso em **Configurações › Organização › Empresas (vendas para empresas)** — ou o admin da plataforma liga na ficha da organização. Até ligar, o menu Empresas, Pessoas e Importação some e as rotas respondem 403. Nada é apagado: ligar devolve tudo.

Criar empresa pela API passou a exigir o nome (`trade_name` ou `legal_name`); só com CNPJ a criação é recusada com 422.
