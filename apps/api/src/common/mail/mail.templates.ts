export type PasswordResetEmailContent = {
  resetUrl: string;
  expiresMinutes: number;
};

export function buildPasswordResetEmail(content: PasswordResetEmailContent): {
  subject: string;
  text: string;
  html: string;
} {
  const { resetUrl, expiresMinutes } = content;
  const subject = 'Foundry 密码重置';

  const text = [
    '您好，',
    '',
    `您正在重置 Foundry 账号密码。请点击以下链接（${expiresMinutes} 分钟内有效）：`,
    resetUrl,
    '',
    '如非本人操作，请忽略此邮件，您的密码不会被更改。',
    '',
    '— Foundry',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr>
      <td style="padding:32px 28px 8px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#2563eb;letter-spacing:0.04em;">FOUNDRY</p>
        <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;color:#111827;">重置您的密码</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 0;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">
          我们收到了您的密码重置请求。点击下方按钮设置新密码，链接将在 <strong>${expiresMinutes} 分钟</strong> 后失效。
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
          重置密码
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 24px;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
          如果按钮无法点击，请复制以下链接到浏览器：<br>
          <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 28px;border-top:1px solid #f3f4f6;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">
          如非本人操作，请忽略此邮件，您的账号仍然安全。
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildRegistrationVerificationEmail(code: string, expiresMinutes: number): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Foundry 注册验证码';
  const text = [
    '您好，',
    '',
    `您的注册验证码是：${code}`,
    `验证码 ${expiresMinutes} 分钟内有效，请勿泄露给他人。`,
    '',
    '如非本人操作，请忽略此邮件。',
    '',
    '— Foundry',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr><td style="padding:28px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#2563eb;">FOUNDRY</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">注册验证码</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">请在注册页面输入以下验证码（${expiresMinutes} 分钟内有效）：</p>
      <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;text-align:center;">${code}</p>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">请勿将验证码告知他人。如非本人操作，请忽略此邮件。</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildPasswordResetVerificationEmail(code: string, expiresMinutes: number): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Foundry 密码重置验证码';
  const text = [
    '您好，',
    '',
    `您的密码重置验证码是：${code}`,
    `验证码 ${expiresMinutes} 分钟内有效，请勿泄露给他人。`,
    '',
    '如非本人操作，请忽略此邮件，您的密码不会被更改。',
    '',
    '— Foundry',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
    <tr><td style="padding:28px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#2563eb;">FOUNDRY</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">密码重置验证码</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">请在密码重置页面输入以下验证码（${expiresMinutes} 分钟内有效）：</p>
      <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;text-align:center;">${code}</p>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">请勿将验证码告知他人。如非本人操作，请忽略此邮件。</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
