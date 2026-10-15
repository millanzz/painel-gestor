// Mapas com Leaflet + OpenStreetMap. As imagens do mapa podem ser trocadas
// por outro provedor com VITE_MAPA_TILES (ex.: MapTiler, Stadia, Carto).
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { addDays, fdate, money, TIPO_LBL } from '@shared';
import { Icone } from './icones';

const TILES = (import.meta.env.VITE_MAPA_TILES as string) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIB = (import.meta.env.VITE_MAPA_ATRIBUICAO as string) || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CENTRO_PADRAO: [number, number] = [-23.55, -46.63];

function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pontos.length === 1) map.setView(pontos[0], 15);
    else if (pontos.length > 1) map.fitBounds(L.latLngBounds(pontos), { padding: [48, 48], maxZoom: 15 });
  }, [map, JSON.stringify(pontos)]);
  return null;
}

type Situacao = { rotulo: string; cor: string; detalhe?: string };

/** Situação de cada face hoje: no ar, opção, livre ou fora de venda. */
function situacao(f: any, reservas: any[], hoje: string): Situacao {
  if (f.status !== 'ativo') return { rotulo: 'Fora de venda', cor: '#8C929C' };
  const r = reservas.find((x) => x.painelId === f.id && x.status !== 'fila' && x.ini <= hoje && x.fim >= hoje);
  if (r) return r.status === 'confirmado'
    ? { rotulo: 'No ar', cor: '#2346D6', detalhe: `${r.campanha} até ${fdate(r.fim).slice(0, 5)}` }
    : { rotulo: 'Em opção', cor: '#6D86E8', detalhe: `${r.campanha} · opção até ${fdate(r.validade).slice(0, 5)}` };
  const prox = reservas.filter((x) => x.painelId === f.id && x.status !== 'fila' && x.ini > hoje).sort((a, b) => (a.ini < b.ini ? -1 : 1))[0];
  return { rotulo: 'Livre', cor: '#0F7A45', detalhe: prox ? `livre até ${fdate(addDays(prox.ini, -1)).slice(0, 5)}` : 'livre no período' };
}

export function MapaFaces({ faces, reservas, hoje, onReservar }: { faces: any[]; reservas: any[]; hoje: string; onReservar?: (id: string) => void }) {
  const pts = faces.filter((f) => f.lat != null && f.lng != null);
  const pontos = useMemo(() => pts.map((f) => [+f.lat, +f.lng] as [number, number]), [pts.length]);
  const semCoord = faces.length - pts.length;
  // Faces da mesma estrutura ficam no mesmo ponto: afasta um pouco para dar para clicar.
  const desloc = (f: any, i: number) => {
    const iguais = pts.filter((x) => x.lat === f.lat && x.lng === f.lng);
    const k = iguais.indexOf(f);
    return k <= 0 ? [+f.lat, +f.lng] as [number, number] : [+f.lat + 0.00018 * k, +f.lng + 0.00018 * k] as [number, number];
  };
  return (
    <div className="miolo largo">
      <div className="card" style={{ height: 'min(620px, 70vh)', overflow: 'hidden', position: 'relative' }}>
        <MapContainer center={pontos[0] || CENTRO_PADRAO} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer url={TILES} attribution={ATRIB} maxZoom={19} />
          <Enquadrar pontos={pontos} />
          {pts.map((f, i) => {
            const s = situacao(f, reservas, hoje);
            return (
              <CircleMarker key={f.id} center={desloc(f, i)} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: s.cor, fillOpacity: 1 }}>
                <Tooltip direction="top" offset={[0, -8]}><span className="mono">{f.codigo}</span> · {s.rotulo}</Tooltip>
                <Popup>
                  <div className="pilha g-050" style={{ minWidth: 220, fontFamily: 'var(--f-sans)' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{f.codigo}</span>
                    <span className="xs t2">{f.endereco} · {f.cidade}</span>
                    <span className="xs">{TIPO_LBL[f.tipo]}{f.sentido ? ` · ${f.sentido}` : ''} · {money(f.valorBi)}/BI</span>
                    <span className="xs" style={{ color: s.cor, fontWeight: 500 }}>{s.rotulo}{s.detalhe ? ` · ${s.detalhe}` : ''}</span>
                    <div className="linha g-100" style={{ marginTop: 8 }}>
                      {onReservar && f.status === 'ativo' && <button className="btn btn-pri btn-sm" onClick={() => onReservar(f.id)}>Reservar</button>}
                      <a className="btn btn-sec btn-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`} style={{ color: 'var(--c-text)' }}>Abrir rota</a>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        {!pts.length && <div className="vazio" style={{ position: 'absolute', inset: 0, zIndex: 500, background: 'rgba(255,255,255,.85)', justifyContent: 'center' }}>Cadastre latitude e longitude nos pontos para ver as faces no mapa.</div>}
      </div>
      <div className="sm t2 linha wrap g-200">
        {[['No ar', '#2346D6'], ['Em opção', '#6D86E8'], ['Livre', '#0F7A45'], ['Fora de venda', '#8C929C']].map(([t, c]) => (
          <span key={t} className="linha g-100"><i style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />{t}</span>
        ))}
        {semCoord > 0 && <span className="warn-t">{semCoord} face(s) sem coordenadas não aparecem</span>}
      </div>
    </div>
  );
}

/* ---- escolher o ponto no cadastro da estrutura ---- */
const pino = L.divIcon({ className: '', html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#2346D6;box-shadow:0 0 0 3px #fff,0 2px 8px rgba(22,26,31,.35)"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });

function Clique({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)) });
  return null;
}
function Centralizar({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, Math.max(map.getZoom(), 16)); }, [pos?.[0], pos?.[1]]);
  return null;
}

/** Mapa pequeno para marcar a posição do ponto, com busca pelo endereço (Nominatim/OSM). */
export function EscolherPonto({ lat, lng, endereco, mudar }: { lat?: number | null; lng?: number | null; endereco: string; mudar: (lat: number, lng: number) => void }) {
  const pos: [number, number] | null = lat != null && lng != null && !isNaN(+lat) ? [+lat, +lng] : null;
  const [busca, setBusca] = useState<'' | 'buscando' | 'nao'>('');
  const buscar = async () => {
    if (!endereco.trim()) return;
    setBusca('buscando');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`, { headers: { 'Accept-Language': 'pt-BR' } });
      const d = await r.json();
      if (d[0]) { mudar(+(+d[0].lat).toFixed(6), +(+d[0].lon).toFixed(6)); setBusca(''); } else setBusca('nao');
    } catch { setBusca('nao'); }
  };
  return (
    <div className="pilha g-100">
      <div className="linha entre g-100">
        <span className="h-card">Posição no mapa</span>
        <button type="button" className="btn btn-sec btn-sm" onClick={buscar} disabled={!endereco.trim() || busca === 'buscando'}><Icone n="busca" />{busca === 'buscando' ? 'Buscando…' : 'Achar pelo endereço'}</button>
      </div>
      <div style={{ height: 240, borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--sh-1)' }}>
        <MapContainer center={pos || CENTRO_PADRAO} zoom={pos ? 16 : 11} style={{ height: '100%' }}>
          <TileLayer url={TILES} attribution={ATRIB} maxZoom={19} />
          <Clique aoClicar={mudar} />
          <Centralizar pos={pos} />
          {pos && <Marker position={pos} icon={pino} draggable eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); mudar(+p.lat.toFixed(6), +p.lng.toFixed(6)); } }} />}
        </MapContainer>
      </div>
      <span className="sm t2">{busca === 'nao' ? 'Endereço não encontrado: clique no mapa para marcar o ponto.' : 'Clique no mapa ou arraste o marcador até a posição exata do painel. É com ela que conferimos as fotos da equipe.'}</span>
    </div>
  );
}
