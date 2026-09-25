/**
 * API_URL (servidor): destino do rewrite /api/* — permite à UI chamar a API pelo mesmo domínio (Vercel, proxy).
 * NEXT_PUBLIC_API_URL (browser): se vazio, o browser usa /api no próprio domínio; se definido, chama a API diretamente.
 * @type {import('next').NextConfig}
 */
const destinoApi = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const nextConfig = {
  // standalone só para a imagem Docker; na Vercel o build normal é o adequado.
  output: process.env.VERCEL ? undefined : 'standalone',
  async rewrites() {
    // Em Vercel, o route handler app/api/[...path]/route.ts faz o proxy com bypass secret.
    // Em Docker/local, o rewrite do Next.js serve de proxy direto.
    if (process.env.VERCEL) return [];
    return [{ source: '/api/:path*', destination: `${destinoApi.replace(/\/+$/, '')}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'X-Frame-Options', value: 'DENY' }] }];
  },
};

export default nextConfig;
