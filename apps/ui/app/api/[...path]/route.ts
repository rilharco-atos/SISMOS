import { NextRequest, NextResponse } from 'next/server';

const API = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const BYPASS = process.env.API_BYPASS_SECRET ?? '';

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = `${API}/api/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  if (BYPASS) headers.set('x-vercel-protection-bypass', BYPASS);

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.arrayBuffer()
    : undefined;

  const res = await fetch(url, { method: req.method, headers, body });

  const resHeaders = new Headers();
  const rct = res.headers.get('content-type');
  if (rct) resHeaders.set('content-type', rct);
  const rcd = res.headers.get('content-disposition');
  if (rcd) resHeaders.set('content-disposition', rcd);

  return new NextResponse(res.body, { status: res.status, headers: resHeaders });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
