const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers: { ...authHeaders(), ...(options?.headers ?? {}) } });
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(Array.isArray(err.message) ? err.message.join('; ') : err.message ?? `HTTP ${res.status}`); }
  return res.json();
}

async function apiUpload<T>(path: string, field: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append(field, file);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
  const res = await fetch(`${BASE}/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(Array.isArray(err.message) ? err.message.join('; ') : err.message ?? `HTTP ${res.status}`); }
  return res.json();
}

/** Abre o PDF de uma versão num novo separador (pedido autenticado). */
export async function abrirPdf(comunicadoId: string, versaoId: string) {
  const janela = window.open('', '_blank');
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/api/comunicados/${comunicadoId}/versoes/${versaoId}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { janela?.close(); throw new Error('PDF não disponível'); }
  const url = URL.createObjectURL(await res.blob());
  if (janela) janela.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const comunicadosApi = {
  list: (params?: string) => apiFetch<any[]>(`/comunicados${params ? '?' + params : ''}`),
  templates: () => apiFetch<{ id: string; label: string; texto: string }[]>('/comunicados/templates'),
  preencher: (data: any) => apiFetch<{ templateId: string; texto: string }>('/comunicados/templates/preencher', { method: 'POST', body: JSON.stringify(data) }),
  analisarXml: (file: File) => apiUpload<any>('/comunicados/xml/analisar', 'file', file),
  uploadImagem: (file: File) => apiUpload<{ imagemUrl: string }>('/comunicados/imagens', 'imagem', file),
  get: (id: string) => apiFetch<any>(`/comunicados/${id}`),
  create: (data: any) => apiFetch<any>('/comunicados', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/comunicados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  aprovar: (id: string) => apiFetch<any>(`/comunicados/${id}/aprovar`, { method: 'PATCH' }),
  cancelar: (id: string) => apiFetch<any>(`/comunicados/${id}/cancelar`, { method: 'PATCH' }),
  arquivar: (id: string) => apiFetch<any>(`/comunicados/${id}/arquivar`, { method: 'PATCH' }),
  remove: (id: string) => apiFetch<any>(`/comunicados/${id}`, { method: 'DELETE' }),
  kpis: () => apiFetch<any>('/comunicados/kpis'),
  publicarWebsite: (id: string) => apiFetch<{ ok: boolean; estado: string; mensagem: string }>(`/comunicados/${id}/website/publicar`, { method: 'POST' }),
  removerWebsite: (id: string) => apiFetch<{ ok: boolean; estado: string; mensagem: string }>(`/comunicados/${id}/website/remover`, { method: 'POST' }),
  novaVersao: (id: string, data: any) => apiFetch<any>(`/comunicados/${id}/versoes`, { method: 'POST', body: JSON.stringify(data) }),
};

export const listasApi = {
  list: (lista?: string) => apiFetch<any[]>(`/listas${lista ? '?lista=' + lista : ''}`),
  create: (data: any) => apiFetch<any>('/listas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/listas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/listas/${id}`, { method: 'DELETE' }),
};

export const usersApi = {
  list: () => apiFetch<any[]>('/users'),
  create: (data: any) => apiFetch<any>('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => apiFetch<any>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => apiFetch<any>(`/users/${id}`, { method: 'DELETE' }),
};

export const systemApi = {
  getConfig: () => apiFetch<any>('/system/config'),
  updateConfig: (data: any) => apiFetch<any>('/system/config', { method: 'PUT', body: JSON.stringify(data) }),
  getAudit: (limit = 100) => apiFetch<any[]>(`/system/audit?limit=${limit}`),
  getHealth: () => apiFetch<any>('/system/health'),
  getSaude: () => apiFetch<any>('/system/saude'),
  testarSmtp: () => apiFetch<{ ok: boolean; origem: string; mensagem: string }>('/system/testar/smtp', { method: 'POST' }),
  testarFtp: () => apiFetch<{ ok: boolean; origem: string; mensagem: string }>('/system/testar/ftp', { method: 'POST' }),
  forcarPolling: () => apiFetch<{ origem: string; ficheiros: number; erro?: string }>('/system/polling', { method: 'POST' }),
};

export const deliveryApi = {
  enviar: (comunicadoId: string, versaoId: string, listas: string[]) =>
    apiFetch<any>(`/delivery/${comunicadoId}/versoes/${versaoId}/enviar`, { method: 'POST', body: JSON.stringify({ listas }) }),
  enviarListas: (comunicadoId: string, versaoId: string, emailListas: string[], smsListas: string[]) =>
    apiFetch<any>(`/delivery/${comunicadoId}/versoes/${versaoId}/enviar`, { method: 'POST', body: JSON.stringify({ emailListas, smsListas }) }),
  emailPreview: (comunicadoId: string, versaoId: string) =>
    apiFetch<{ html: string }>(`/delivery/${comunicadoId}/versoes/${versaoId}/email-preview`),
};
