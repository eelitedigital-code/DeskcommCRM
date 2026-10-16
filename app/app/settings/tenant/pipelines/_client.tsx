"use client";

import { useT } from "@/hooks/i18n/useT";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import type { PipelineConfigPatch } from "@/lib/schemas/settings";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { modoDeReabertura } from "@/lib/leads/reabertura";
import { CATEGORIAS_DE_PERDA } from "@/lib/schemas/leads";
import { type CustomFieldDef } from "@/lib/schemas/settings";
import {
  EditorDeCampos,
  prepararCamposParaGravar,
  type EtapaDoFunil,
} from "@/components/settings/EditorDeCampos";
import { AgentMappingSection, ancoraDoMapeamento } from "./_mapping";
import { StagesSection, ancoraDasEtapas } from "./_stages";

export interface PipelineRow {
  id: string;
  name: string;
  slug: string;
  vocabulary: Record<string, string> | null;
  settings: Record<string, unknown> | null;
}

// O editor de campos e as regras dele moram em `components/settings/EditorDeCampos`
// desde que os campos do cliente ganharam tela própria. Reexportados daqui para
// quem já os importava desta tela (os testes inclusive).
export {
  TIPOS_DE_CAMPO,
  tipoTemOpcoes,
  normalizaObrigatorioEm,
  comEtapa,
  comGatilho,
  SEM_CONDICAO,
  SEM_VALOR_DA_CONDICAO,
  operadorDaCondicao,
  valorDaCondicao,
  escreveMostrarQuando,
  normalizaMostrarQuando,
} from "@/components/settings/EditorDeCampos";
export type { EtapaDoFunil } from "@/components/settings/EditorDeCampos";

/**
 * Os RÓTULOS cadastrados (issue #1537): `lost_reasons` aceita texto puro E
 * `{ label, categoria }`, e esta caixa é sempre rótulo — o objeto é guardado
 * aqui embaixo, na hora de salvar.
 */
function readLostReasons(settings: Record<string, unknown> | null): string[] {
  if (!settings) return [];
  const r = (settings as { lost_reasons?: unknown }).lost_reasons;
  if (!Array.isArray(r)) return [];
  return r
    .map((item) => (typeof item === "string" ? item : (item as { label?: unknown })?.label))
    .filter((v): v is string => typeof v === "string");
}

/** Rótulo → categoria gravada (issue #1537). Sem categoria é ausência, não "". */
function readCategorias(settings: Record<string, unknown> | null): Record<string, string> {
  const saida: Record<string, string> = {};
  if (!settings) return saida;
  const r = (settings as { lost_reasons?: unknown }).lost_reasons;
  if (!Array.isArray(r)) return saida;
  for (const item of r) {
    if (typeof item !== "object" || item === null) continue;
    const { label, categoria } = item as { label?: unknown; categoria?: unknown };
    if (typeof label === "string" && typeof categoria === "string" && categoria.trim()) {
      saida[label.trim()] = categoria.trim();
    }
  }
  return saida;
}


function readWonReasons(settings: Record<string, unknown> | null): string[] {
  const r = (settings as { won_reasons?: unknown } | null)?.won_reasons;
  return Array.isArray(r) ? r.filter((v): v is string => typeof v === "string") : [];
}
export function PipelinesClient({
  pipelines,
  etapas = {},
  podeEditarConfig,
  comandaDisponivel = false,
}: {
  pipelines: PipelineRow[];
  /**
   * As etapas de cada funil por id de funil — o que o editor de `obrigatorio_em`
   * oferece como "exigir ao entrar aqui". Opcional só para os testes que não
   * exercitam esta regra; a página sempre manda.
   */
  etapas?: Record<string, EtapaDoFunil[]>;
  /** Vocabulário/custom fields são admin (a server action recusa o resto). */
  podeEditarConfig: boolean;
  /**
   * O módulo `financeiro` está instalado (#1907)? Sem ele não existe comanda, e o
   * interruptor "abrir comanda ao ganhar" some. Ausente = desligado (falha
   * fechada); a página sempre manda.
   */
  comandaDisponivel?: boolean;
}) {
  const t = useT();
  if (pipelines.length === 0) {
    // ⚠️ NÃO PROMETA UM CAMINHO QUE NÃO EXISTE. Criar funil não é feito por
    // nenhuma tela, rota ou action deste produto — só por script de instalação;
    // e como o instalador não provisiona funil, ESTE é o estado de toda
    // instalação nova. O texto anterior mandava "crie um no quadro", e o quadro
    // vazio manda "Ir para Configurações": pingue-pongue fechado, com o usuário
    // procurando um botão que não existe em lugar nenhum.
    return (
      <Card className="p-6 text-sm leading-relaxed text-muted-foreground">
        {t("Você ainda não tem nenhum funil. Enquanto for assim, o agente atende normalmente, mas não tem para onde levar o card de ninguém — não há etapas para onde mover. Criar o funil é feito por quem instalou o sistema, direto no banco; depois ele aparece aqui para você escolher a etapa de cada passo.")}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {pipelines.map((p) => (
        <Card key={p.id} className="space-y-6 p-6">
          <header>
            <h2 className="text-base font-semibold">{p.name}</h2>
            <p className="text-xs text-muted-foreground">/{p.slug}</p>
          </header>
          {/* As ETAPAS vêm primeiro, e a ordem é a do raciocínio de quem
              configura: primeiro o quadro existe do jeito da sua operação,
              depois se decide o que o assistente faz com ele. Invertido, a
              primeira coisa que o dono da clínica vê é um mapeamento sobre
              colunas de e-commerce que ele nem sabia que dava para trocar. */}
          <StagesSection pipelineId={p.id} ancoraMapeamento={ancoraDoMapeamento(p.id)} />
          <div className="border-t border-border pt-6">
            <AgentMappingSection pipelineId={p.id} ancoraEtapas={ancoraDasEtapas(p.id)} />
          </div>
          {podeEditarConfig && (
            <PipelineEditor
              pipeline={p}
              etapas={etapas[p.id] ?? []}
              comandaDisponivel={comandaDisponivel}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function PipelineEditor({
  pipeline,
  etapas,
  comandaDisponivel,
}: {
  pipeline: PipelineRow;
  etapas: EtapaDoFunil[];
  comandaDisponivel: boolean;
}) {
  const t = useT();
  const v = pipeline.vocabulary ?? {};
  const [lead, setLead] = useState(v.lead ?? "Lead");
  const [deal, setDeal] = useState(v.deal ?? "Deal");
  const [won, setWon] = useState(v.won ?? "Ganho");
  const [lost, setLost] = useState(v.lost ?? "Perdido");
  const [reasonsText, setReasonsText] = useState(readLostReasons(pipeline.settings).join(", "));
  const [wonReasonsText, setWonReasonsText] = useState(readWonReasons(pipeline.settings).join(", "));
  const [categorias, setCategorias] = useState<Record<string, string>>(() =>
    readCategorias(pipeline.settings),
  );
  const [wonRequired, setWonRequired] = useState(
    (pipeline.settings as { won_reason_required?: unknown } | null)?.won_reason_required === true,
  );
  // A comanda do ganho (#1477): opt-in, e o PADRÃO é a chave ausente — só o
  // `true` explícito liga. Ausência aqui renderiza desmarcado, que é o mesmo
  // que o consumidor de `lead.won` lê no banco.
  const [comandaNoGanho, setComandaNoGanho] = useState(
    (pipeline.settings as { comanda_no_ganho?: unknown } | null)?.comanda_no_ganho === true,
  );
  const [retomaComoNovo, setRetomaComoNovo] = useState(
    modoDeReabertura(pipeline.settings) === "novo_negocio",
  );
  const [fields, setFields] = useState<CustomFieldDef[]>(camposDoFunil(pipeline.settings));
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const preparados = prepararCamposParaGravar(fields);
    if (!preparados.ok) {
      toast.error(preparados.mensagem ?? t("Campo inválido."));
      return;
    }
    const ok = preparados.campos;
    const reasons = reasonsText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // #1537: motivo com categoria vira `{ label, categoria }`; sem categoria
    // continua string pura — formato que todo funil já tem e que o trigger
    // aceita igual.
    const motivosComCategoria = reasons.map((rotulo) => {
      const categoria = categorias[rotulo];
      return categoria ? { label: rotulo, categoria } : rotulo;
    });

    const wonReasons = wonReasonsText
      .split(",")
      .map((s2) => s2.trim())
      .filter((s2) => s2.length > 0);

    const patch: PipelineConfigPatch = {
      vocabulary: { lead, deal, won, lost },
      fields: ok,
      lost_reasons: motivosComCategoria,
      won_reasons: wonReasons,
      won_reason_required: wonRequired,
      comanda_no_ganho: comandaNoGanho,
      reabertura: retomaComoNovo ? "novo_negocio" : "mesmo_registro",
    };
    startTransition(async () => {
      const r = await updatePipelineConfig(pipeline.id, patch);
      if (r.ok) toast.success(`${pipeline.name} ${t("atualizado.")}`);
      else toast.error(`${t("Erro:")} ${r.error}`);
    });
  }


  const motivosDaCaixa = reasonsText
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-semibold">{t("Vocabulário e campos")}</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Lead</Label>
          <Input value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Deal</Label>
          <Input value={deal} onChange={(e) => setDeal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Won</Label>
          <Input value={won} onChange={(e) => setWon(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Lost</Label>
          <Input value={lost} onChange={(e) => setLost(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("Motivos de perda (separados por vírgula)")}</Label>
        <Input value={reasonsText} onChange={(e) => setReasonsText(e.target.value)} />
        {/*
          #1537 — a categoria de CADA motivo, não um campo só: é ela que o
          relatório "Perdas" e o filtro do quadro agrupam. Só aparece para
          motivo já escrito na caixa de cima: a lista continua sendo texto e a
          ordem continua sendo a do texto; o que muda é que cada item ganhou
          um campo. `__sem__` porque o Select recusa value="".
        */}
        {motivosDaCaixa.map((motivo) => {
          const opcoes = [
            ...new Set([
              ...CATEGORIAS_DE_PERDA,
              ...(categorias[motivo] ? [categorias[motivo]] : []),
            ]),
          ];
          return (
            <div key={motivo} className="flex items-center gap-2">
              <span className="w-56 truncate text-xs text-muted-foreground">{motivo}</span>
              <Select
                value={categorias[motivo] ?? "__sem__"}
                onValueChange={(valor) =>
                  setCategorias((atual) => {
                    const proximo = { ...atual };
                    if (valor === "__sem__") delete proximo[motivo];
                    else proximo[motivo] = valor;
                    return proximo;
                  })
                }
              >
                <SelectTrigger className="h-8 w-56 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sem__">{t("Sem categoria")}</SelectItem>
                  {opcoes.map((categoria) => (
                    <SelectItem key={categoria} value={categoria}>
                      {categoria}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("Motivos de ganho (separados por vírgula)")}</Label>
        <Input value={wonReasonsText} onChange={(e) => setWonReasonsText(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          {t(
            "Sem motivos cadastrados o motivo de ganho é texto livre. Com a lista, só o que está nela é aceito.",
          )}
        </p>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={wonRequired}
            onChange={(e) => setWonRequired(e.target.checked)}
          />
          {t("Exigir motivo de ganho ao fechar como ganho")}
        </label>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={retomaComoNovo}
            onChange={(e) => setRetomaComoNovo(e.target.checked)}
          />
          {t("Negócio encerrado que volta abre um negócio novo")}
        </label>
        <p className="text-xs text-muted-foreground">
          {t(
            "Desligado, arrastar um negócio perdido ou ganho para uma etapa aberta reabre o mesmo negócio. Ligado, o encerrado fica como está e o quadro oferece criar uma nova tentativa com o mesmo contato.",
          )}
        </p>
      </div>

      {/* ─── A COMANDA DO GANHO (#1477) ───────────────────────────────
          Porta do consumidor de `lead.won`. Desligada por padrão, pela régua
          de `docs/doctrine/extensoes.md`: quem não ativar continua com a
          operação inteira, e em loja com checkout o valor do negócio não é
          conta a receber. Sem o módulo `financeiro` instalado (#1907) não
          há comanda, e o interruptor some; o valor salvo no funil fica como
          está, e o consumidor também confere o módulo. */}
      {comandaDisponivel && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={comandaNoGanho}
              onChange={(e) => setComandaNoGanho(e.target.checked)}
            />
            {t("Abrir comanda ao ganhar um negócio neste funil")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t(
              "Desligado, ganhar não mexe no financeiro: loja com checkout, infoproduto e imobiliária não vivem de conta a receber. Ligado, o arrasto para a etapa de ganho e o botão Ganhar abrem uma comanda com o valor e o contato do negócio.",
            )}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">{t("Campos do lead neste funil")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("Aparecem no dossiê do negócio. No follow-up, você escolhe em qual campo gravar a resposta.")}
        </p>
        <EditorDeCampos fields={fields} onChange={setFields} etapas={etapas} />
      </div>

      <div className="flex sm:justify-end">
        <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? t("Salvando…") : t("Salvar vocabulário e campos")}
        </Button>
      </div>
    </div>
  );
}
