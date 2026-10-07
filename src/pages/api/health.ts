import type { APIRoute } from 'astro';

export const GET = (() =>
  new Response(
    JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )) satisfies APIRoute;
