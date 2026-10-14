const P: Record<string, string> = {
  inicio: 'M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  agenda: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  vendas: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  campo: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  dinheiro: 'M3 6h18v13H3zM3 10h18M7 15h3',
  paineis: 'M3 4h18v11H3zM8 15v5M16 15v5',
  clientes: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3 2.8 3 6',
  relatorios: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  material: 'M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4M15 8.5a1 1 0 1 0 0-.01',
  usuarios: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  config: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  auditoria: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  busca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  mais: 'M12 5v14M5 12h14',
  fechar: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 6l-6 6 6 6',
  baixo: 'M6 9l6 6 6-6',
  trocar: 'M8 10l4-4 4 4M8 14l4 4 4-4',
  pontos: 'M5 12h.01M12 12h.01M19 12h.01',
  rota: 'M3 11l18-8-8 18-2-8z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  mapa: 'M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  chave: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  pdf: 'M6 3h9l4 4v14H6zM14 3v5h5M9 14h6M9 17h4',
  whatsapp: 'M4 20l1.3-3.9A8 8 0 1 1 8 19zM9 9.5c.5 2 2.5 4 4.5 4.5l1.5-1.2 2 1-.5 1.7c-3.5.3-7.8-4-7.5-7.5L10.7 7l1 2z',
  pix: 'M12 3l4 4-4 4-4-4zM12 13l4 4-4 4-4-4zM3 12l4-4 4 4-4 4zM13 12l4-4 4 4-4 4z',
  lixeira: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  menu: 'M4 6h16M4 12h16M4 18h16',
  alerta: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.01',
  relogio: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  copiar: 'M8 8h12v12H8zM4 16V4h12',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  restaurar: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
};

export type NomeIcone = keyof typeof P;

export function Icone({ n, t = 16, cor, largura = 1.75, className }: { n: NomeIcone; t?: number; cor?: string; largura?: number; className?: string }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke={cor || 'currentColor'} strokeWidth={largura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={P[n]} />
    </svg>
  );
}
