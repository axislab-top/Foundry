import { loadSmtpMailConfig } from './mail.config.js';

describe('loadSmtpMailConfig', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns null when SMTP_HOST is unset', () => {
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_DEV_LOG_ONLY;
    expect(loadSmtpMailConfig()).toBeNull();
  });

  it('returns null when MAIL_DEV_LOG_ONLY is true', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.MAIL_DEV_LOG_ONLY = 'true';
    expect(loadSmtpMailConfig()).toBeNull();
  });

  it('parses SMTP config when host and from are set', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    delete process.env.MAIL_DEV_LOG_ONLY;

    const config = loadSmtpMailConfig();
    expect(config).toMatchObject({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      from: 'noreply@example.com',
      user: 'user',
      pass: 'pass',
    });
  });

  it('throws when SMTP_HOST is set without sender', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    delete process.env.SMTP_FROM;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_DEV_LOG_ONLY;

    expect(() => loadSmtpMailConfig()).toThrow(/SMTP_FROM/);
  });
});
