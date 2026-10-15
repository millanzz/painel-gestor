// Monitoramento de erros com Sentry. Só liga quando SENTRY_DSN está definido.
import * as Sentry from '@sentry/node';
import { env } from './env';

let ligado = false;

export function iniciarMonitoramento() {
  if (!env.sentryDsn || ligado) return;
  Sentry.init({ dsn: env.sentryDsn, environment: env.producao ? 'producao' : 'desenvolvimento', tracesSampleRate: 0 });
  ligado = true;
  console.log('[sentry] monitoramento de erros ativo');
}

export function reportarErro(err: unknown, contexto?: Record<string, unknown>) {
  if (!ligado) return;
  Sentry.withScope((s) => {
    if (contexto) s.setContext('requisicao', contexto);
    Sentry.captureException(err);
  });
}
