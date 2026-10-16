/**
 * Um ícone por TIPO de canal de origem (Spec 04 §6) — desenho próprio, traço
 * simples, nunca o logotipo de uma marca. Herda a cor do texto (`currentColor`)
 * para seguir o tema claro/escuro.
 */
import type { IconeDeCanal } from "@/lib/painel-atendimento/origens";

const TRACOS: Record<IconeDeCanal, React.ReactNode> = {
  // megafone: anúncio
  anuncio: (
    <>
      <path d="M4 10v4h3l7 4V6l-7 4H4z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M7 14l1 5h2l-1-5" />
    </>
  ),
  // folha com linhas: formulário
  formulario: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  // balão de conversa genérico: mensagem direta
  whatsapp: (
    <>
      <path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.4-3.6A7.9 7.9 0 0 1 4 12z" />
      <path d="M9 11h6M9 14h4" />
    </>
  ),
  // três nós ligados: rede social
  rede_social: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8" />
    </>
  ),
  // duas pessoas: indicação
  indicacao: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M13.5 18.5c.3-2.4 1.6-4 3-4 1.9 0 3.5 1.8 3.5 4" />
    </>
  ),
  // globo: site
  site: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" />
    </>
  ),
  // lápis: cadastro manual
  manual: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </>
  ),
  // círculo com interrogação: sem origem
  sem_origem: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5V14" />
      <path d="M12 17h.01" />
    </>
  ),
  // três pontos: outros
  outros: (
    <>
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </>
  ),
};

export function IconeDoCanal({ icone, tamanho = 20, className }: { icone: IconeDeCanal; tamanho?: number; className?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {TRACOS[icone]}
    </svg>
  );
}
