import { defineMiddleware } from 'astro:middleware';
import { DEVELOPER_SESSION_COOKIE, isValidDeveloperSession } from './lib/developer-auth';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.isDeveloper = isValidDeveloperSession(
    context.cookies.get(DEVELOPER_SESSION_COOKIE)?.value,
  );
  const response = await next();
  if (context.locals.isDeveloper) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

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
