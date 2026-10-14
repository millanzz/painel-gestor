import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Area } from '@shared';
import { ErroApi } from './api';
import { SessaoProvider, useSessao } from './sessao';
import { AvisosProvider, Carregando } from './ui/base';
import { Casca } from './ui/Casca';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './ui/estilo.css';
import Entrar from './paginas/Entrar';
import Inicio from './paginas/Inicio';

const Agenda = lazy(() => import('./paginas/Agenda'));
const Contratos = lazy(() => import('./paginas/Contratos'));
const Contrato = lazy(() => import('./paginas/Contrato'));
const Clientes = lazy(() => import('./paginas/Clientes'));
const Paineis = lazy(() => import('./paginas/Paineis'));
const Campo = lazy(() => import('./paginas/Campo'));
const Artes = lazy(() => import('./paginas/Artes'));
const Dinheiro = lazy(() => import('./paginas/Dinheiro'));
const Relatorios = lazy(() => import('./paginas/Relatorios'));
const Usuarios = lazy(() => import('./paginas/Usuarios'));
const Config = lazy(() => import('./paginas/Config'));
const Auditoria = lazy(() => import('./paginas/Auditoria'));
const Portal = lazy(() => import('./paginas/Portal'));

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ErroApi && e.status < 500) && n < 2, refetchOnWindowFocus: true, staleTime: 20_000 },
  },
});

function Protegida({ area, children }: { area: Area; children: ReactNode }) {
  const { vê } = useSessao();
  if (!vê(area)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Rotas() {
  const { sessao, carregando } = useSessao();
  const loc = useLocation();
  if (carregando) return <Carregando />;
  if (!sessao || !sessao.empresaId) {
    if (loc.pathname !== '/entrar') return <Navigate to={`/entrar${loc.search || ''}`} replace />;
    return <Entrar />;
  }
  if (loc.pathname === '/entrar' && !new URLSearchParams(loc.search).has('nova')) return <Navigate to="/" replace />;
  if (loc.pathname === '/entrar') return <Entrar />;

  if (sessao.perfil === 'cliente') {
    return <Suspense fallback={<Carregando />}><Routes><Route path="*" element={<Portal />} /></Routes></Suspense>;
  }

  const P = (area: Area, el: ReactNode) => <Protegida area={area}>{el}</Protegida>;
  return (
    <Casca>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/" element={sessao.perfil === 'operacao' ? <Navigate to="/campo" replace /> : <Inicio />} />
          <Route path="/agenda" element={P('agenda', <Agenda />)} />
          <Route path="/contratos" element={P('contratos', <Contratos />)} />
          <Route path="/contratos/:id" element={P('contratos', <Contrato />)} />
          <Route path="/clientes" element={P('clientes', <Clientes />)} />
          <Route path="/paineis" element={P('paineis', <Paineis />)} />
          <Route path="/campo" element={P('campo', <Campo />)} />
          <Route path="/artes" element={P('artes', <Artes />)} />
          <Route path="/dinheiro" element={P('dinheiro', <Dinheiro />)} />
          <Route path="/relatorios" element={P('relatorios', <Relatorios />)} />
          <Route path="/usuarios" element={P('usuarios', <Usuarios />)} />
          <Route path="/config" element={P('config', <Config />)} />
          <Route path="/auditoria" element={P('auditoria', <Auditoria />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Casca>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AvisosProvider>
          <SessaoProvider>
            <Rotas />
          </SessaoProvider>
        </AvisosProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
