// Minimal client for the public BDNS API (infosubvenciones.es). No key required.
// Respect the reuse notice: cache results, never call this on the demo hot path.
import type { BeneficiaryType } from './types.ts';

export const BDNS_BASE = 'https://www.infosubvenciones.es/bdnstrans/api';

// Filter ids from /finalidades and /regiones.
export const FINALIDAD = { cultura: 11, comercioTurismoPymes: 14, empleo: 6, idi: 17 } as const;
export const REGION = { espana: 1, galicia: 3 } as const;

export interface BdnsSearchItem {
  id: number;
  numeroConvocatoria: string;
  descripcion: string;
  fechaRecepcion: string;
  nivel1: string;
  nivel2: string;
  nivel3: string | null;
}

export interface BdnsDetail {
  id: number;
  codigoBDNS: string;
  organo: { nivel1: string; nivel2: string; nivel3: string | null };
  sedeElectronica: string | null;
  fechaRecepcion: string;
  tipoConvocatoria: string;
  presupuestoTotal: number | null;
  descripcion: string;
  tiposBeneficiarios: { descripcion: string }[];
  sectores: { descripcion: string; codigo: string }[];
  regiones: { descripcion: string }[];
  descripcionFinalidad: string | null;
  urlBasesReguladoras: string | null;
  abierto: boolean;
  fechaInicioSolicitud: string | null;
  fechaFinSolicitud: string | null;
  textInicio: string | null;
  textFin: string | null;
  documentos: { id: number; descripcion: string; nombreFic: string }[];
}

export interface SearchParams {
  descripcion?: string;
  finalidad?: number;
  regiones?: number;
  fechaDesde?: string; // dd/mm/yyyy
  page?: number;
  pageSize?: number;
}

// Retries on 429/5xx with exponential backoff (BDNS rate-limits bursts).
async function getJson<T>(path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${BDNS_BASE}${path}`, { headers: { accept: 'application/json' } });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return getJson(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`BDNS ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export async function searchCalls(p: SearchParams): Promise<{ content: BdnsSearchItem[]; totalElements: number }> {
  const q = new URLSearchParams({ vpd: 'GE', page: String(p.page ?? 0), pageSize: String(p.pageSize ?? 50) });
  for (const k of ['descripcion', 'finalidad', 'regiones', 'fechaDesde'] as const) {
    if (p[k] !== undefined) q.set(k, String(p[k]));
  }
  return getJson(`/convocatorias/busqueda?${q}`);
}

export function getCallDetail(codigoBDNS: string): Promise<BdnsDetail> {
  return getJson(`/convocatorias?numConv=${encodeURIComponent(codigoBDNS)}&vpd=GE`);
}

export function documentUrl(idDocumento: number): string {
  return `${BDNS_BASE}/convocatorias/documentos?idDocumento=${idDocumento}`;
}

export function bdnsPublicUrl(codigoBDNS: string): string {
  return `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${codigoBDNS}`;
}

const BENEFICIARY_MAP: Record<string, BeneficiaryType> = {
  'PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA': 'persona_fisica',
  'PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA': 'autonomo_pyme',
  'PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA': 'entidad_sin_animo',
  'GRAN EMPRESA': 'gran_empresa',
};

export function mapBeneficiaries(d: Pick<BdnsDetail, 'tiposBeneficiarios'>): BeneficiaryType[] {
  const out = new Set<BeneficiaryType>();
  for (const t of d.tiposBeneficiarios ?? []) {
    const m = BENEFICIARY_MAP[t.descripcion.trim().toUpperCase()];
    if (m) out.add(m);
  }
  return [...out];
}

// "ES11 - GALICIA" -> "ES11"; "ES - ESPAÑA" -> "ES".
export function mapRegions(d: Pick<BdnsDetail, 'regiones'>): string[] {
  return (d.regiones ?? []).map((r) => r.descripcion.split(' - ')[0].trim()).filter(Boolean);
}

// Open to applicants: competitive or non-competitive (first-come) calls.
// Direct awards / convenios / nominativas are pre-assigned to a named beneficiary, so they are excluded.
export function isApplicable(d: Pick<BdnsDetail, 'tipoConvocatoria' | 'descripcion'>): boolean {
  if (/concesi[oó]n directa|nominativ|convenio/i.test(`${d.tipoConvocatoria ?? ''} ${d.descripcion ?? ''}`)) return false;
  return /concurrencia/i.test(d.tipoConvocatoria ?? '');
}

// Relevant for a user in Galicia: Galicia-wide, a Galician province, or all of Spain.
export function isRelevantRegion(regions: string[]): boolean {
  return regions.length === 0 || regions.some((r) => r === 'ES' || r.startsWith('ES11'));
}
