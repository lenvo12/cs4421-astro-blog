import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  console.log(
    JSON.stringify({
      method: context.request.method,
      path: new URL(context.request.url).pathname,
      status: response.status,
      timestamp: new Date().toISOString(),
    }),
  );

  return response;
});
