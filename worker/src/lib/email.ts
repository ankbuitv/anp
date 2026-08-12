import type { Env } from "../env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function verificationEmail(name: string, url: string): EmailMessage {
  const safeName = escapeHtml(name || "bạn");
  const safeUrl = escapeHtml(url);
  const text = [
    `Xin chào ${name || "bạn"},`,
    "",
    "Vui lòng xác nhận địa chỉ email cho tài khoản ANP bằng liên kết dưới đây:",
    url,
    "",
    "Liên kết sẽ hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản ANP, hãy bỏ qua email này.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#12100e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f6efe6">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="font-size:28px;font-weight:700;color:#d7a36a;margin-bottom:20px">ANP</div>
      <div style="background:#1d1915;border:1px solid #342d25;border-radius:20px;padding:28px">
        <h1 style="margin:0 0 12px;font-size:22px">Xác nhận email của bạn</h1>
        <p style="margin:0 0 20px;line-height:1.6;color:#cdbfae">Xin chào ${safeName}, nhấn nút bên dưới để xác nhận email và bắt đầu dùng thư viện ảnh/video riêng của ANP.</p>
        <a href="${safeUrl}" style="display:inline-block;background:#d7a36a;color:#17120d;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Xác nhận email</a>
        <p style="margin:20px 0 0;color:#9f8e7d;font-size:13px;word-break:break-all">${safeUrl}</p>
      </div>
      <p style="margin:20px 0 0;color:#8f8070;font-size:12px">Liên kết hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>
    </div>
  </body></html>`;
  return { to: "", subject: "Xác nhận email ANP", text, html };
}

export function hasEmailProvider(env: Env): boolean {
  if (env.EMAIL_PROVIDER === "none") return false;
  if (env.EMAIL_PROVIDER === "log") return true;
  if (env.RESEND_API_KEY || env.BREVO_API_KEY) return true;
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) return true;
  return false;
}

export async function sendEmail(env: Env, message: EmailMessage): Promise<void> {
  if (env.EMAIL_PROVIDER === "log" || env.ENVIRONMENT === "development") {
    console.log("[email]", JSON.stringify({ to: message.to, subject: message.subject, text: message.text }));
    return;
  }
  if (env.RESEND_API_KEY) return sendResend(env, message);
  if (env.BREVO_API_KEY) return sendBrevo(env, message);
  if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) return sendMailgun(env, message);
  console.warn("[email:no-provider]", JSON.stringify({ to: message.to, subject: message.subject, text: message.text }));
}

async function sendResend(env: Env, message: EmailMessage) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || "ANP <no-reply@mail.ankb.qzz.io>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!res.ok) throw new Error(`Gửi email thất bại (Resend ${res.status}).`);
}

async function sendBrevo(env: Env, message: EmailMessage) {
  const from = parseAddress(env.MAIL_FROM || "ANP <no-reply@ankb.qzz.io>");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gửi email thất bại (Brevo ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}).`);
  }
}

function parseAddress(raw: string): { email: string; name?: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]!.replace(/^["']|["']$/g, ""), email: m[2]! };
  return { email: raw.trim() };
}

async function sendMailgun(env: Env, message: EmailMessage) {
  const basic = btoa(`api:${env.MAILGUN_API_KEY}`);
  const body = new FormData();
  body.set("from", env.MAIL_FROM || `ANP <mailgun@${env.MAILGUN_DOMAIN}>`);
  body.set("to", message.to);
  body.set("subject", message.subject);
  body.set("text", message.text);
  body.set("html", message.html);
  const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}` },
    body,
  });
  if (!res.ok) throw new Error(`Gửi email thất bại (Mailgun ${res.status}).`);
}
