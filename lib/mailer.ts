import { Resend } from 'resend';

/**
 * Transport email unifié — compatible avec l'interface du client Resend
 * (`.emails.send()` et `.batch.send()`). Route vers **Brevo** si `BREVO_API_KEY`
 * est posé, sinon vers **Resend** (`RESEND_API_KEY`).
 *
 * Objectif : basculer de fournisseur en posant/retirant une variable d'env,
 * sans toucher aux ~15 sites d'appel (chacun garde `resend.emails.send({...})`,
 * on remplace juste l'instanciation par ce shim). Rollback = retirer BREVO_API_KEY.
 */

const BREVO_KEY = process.env.BREVO_API_KEY;
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface SendArgs {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  headers?: Record<string, string>;
  replyTo?: string;
  reply_to?: string;
  cc?: string | string[];
  bcc?: string | string[];
  // Champs additionnels éventuels passés tels quels à Resend en mode fallback.
  [key: string]: unknown;
}

function parseAddr(a: string): { name?: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(a);
  if (m) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: a.trim() };
}

const list = (v: string | string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

async function sendViaBrevo(a: SendArgs): Promise<{ data: { id: string | null }; error: null }> {
  const body: Record<string, unknown> = {
    sender: parseAddr(a.from),
    to: list(a.to).map((email) => ({ email })),
    subject: a.subject,
    htmlContent: a.html,
  };
  if (a.headers) body.headers = a.headers;
  const rt = a.replyTo ?? a.reply_to;
  if (rt) body.replyTo = parseAddr(rt);
  if (a.cc) body.cc = list(a.cc).map((email) => ({ email }));
  if (a.bcc) body.bcc = list(a.bcc).map((email) => ({ email }));

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_KEY as string,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo email failed (${res.status}): ${detail}`);
  }
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { data: { id: json.messageId ?? null }, error: null };
}

export const mailer = {
  emails: {
    async send(a: SendArgs) {
      if (BREVO_KEY) return sendViaBrevo(a);
      if (resendClient) return resendClient.emails.send(a as Parameters<typeof resendClient.emails.send>[0]);
      throw new Error('Aucun fournisseur email configuré (BREVO_API_KEY ou RESEND_API_KEY).');
    },
  },
  batch: {
    async send(arr: SendArgs[]) {
      if (BREVO_KEY) {
        const results = await Promise.allSettled(arr.map(sendViaBrevo));
        const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        return { data: null, error: rejected ? { message: String(rejected.reason) } : null };
      }
      if (resendClient) return resendClient.batch.send(arr as Parameters<typeof resendClient.batch.send>[0]);
      throw new Error('Aucun fournisseur email configuré.');
    },
  },
};

/** true si au moins un fournisseur email est configuré (Brevo ou Resend). */
export function emailConfigured(): boolean {
  return Boolean(BREVO_KEY || resendClient);
}
