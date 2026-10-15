// Consulta de CEP pelo ViaCEP (gratuito). Devolve também o código IBGE do município,
// exigido na nota fiscal.
export interface Endereco { logradouro: string; bairro: string; cidade: string; uf: string; codigoMunicipio: string }

export async function buscarCep(cep: string): Promise<Endereco | null> {
  const d = cep.replace(/\D/g, '');
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (j.erro) return null;
    return { logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '', codigoMunicipio: j.ibge || '' };
  } catch {
    return null;
  }
}

/** Para usar em FormGaveta.aoMudar: ao completar o CEP, preenche o endereço. */
export function preencherPeloCep(k: string, val: any, _v: Record<string, any>, mudar: (k: string, v: any) => void) {
  if (k !== 'cep' || String(val).replace(/\D/g, '').length !== 8) return;
  buscarCep(String(val)).then((e) => {
    if (!e) return;
    if (e.logradouro) mudar('logradouro', e.logradouro);
    if (e.bairro) mudar('bairro', e.bairro);
    mudar('cidade', e.cidade);
    mudar('uf', e.uf);
    mudar('codigoMunicipio', e.codigoMunicipio);
  });
}
