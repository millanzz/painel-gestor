// Monitoramento de erros no navegador (Sentry). Liga só com VITE_SENTRY_DSN.
import * as Sentry from '@sentry/react';

export function iniciarMonitoramento() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
}

export const reportarErro = (e: unknown) => Sentry.captureException(e);
