import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { Transporter } from 'nodemailer';
import { loadSmtpMailConfig, type SmtpMailConfig } from './mail.config.js';

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = {
  mode: 'smtp' | 'dev-log';
  messageId?: string;
};

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private smtpConfig: SmtpMailConfig | null = null;
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  onModuleInit(): void {
    try {
      this.smtpConfig = loadSmtpMailConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invalid SMTP configuration: ${message}`);
      this.smtpConfig = null;
      return;
    }

    if (!this.smtpConfig) {
      this.logger.log(
        'SMTP not configured (SMTP_HOST unset or MAIL_DEV_LOG_ONLY=true). Outbound mail will be logged only.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.smtpConfig.host,
      port: this.smtpConfig.port,
      secure: this.smtpConfig.secure,
      auth:
        this.smtpConfig.user && this.smtpConfig.pass
          ? { user: this.smtpConfig.user, pass: this.smtpConfig.pass }
          : undefined,
      connectionTimeout: this.smtpConfig.connectionTimeoutMs,
      greetingTimeout: this.smtpConfig.greetingTimeoutMs,
      socketTimeout: this.smtpConfig.socketTimeoutMs,
    });

    void this.verifyTransportAtStartup();
  }

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = null;
  }

  /** 当前是否将通过 SMTP 真实发送 */
  isSmtpEnabled(): boolean {
    return this.transporter != null && this.smtpConfig != null;
  }

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    if (!this.transporter || !this.smtpConfig) {
      this.logger.log(
        `[mail:dev] to=${input.to} subject="${input.subject}"\n${input.text}`,
      );
      return { mode: 'dev-log' };
    }

    const info = await this.transporter.sendMail({
      from: this.smtpConfig.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    });

    this.logger.log(
      `Mail sent via SMTP to=${input.to} subject="${input.subject}" messageId=${info.messageId ?? 'n/a'}`,
    );

    return { mode: 'smtp', messageId: info.messageId };
  }

  private async verifyTransportAtStartup(): Promise<void> {
    if (!this.transporter || !this.smtpConfig) return;

    try {
      await this.transporter.verify();
      this.logger.log(
        `SMTP ready host=${this.smtpConfig.host} port=${this.smtpConfig.port} secure=${this.smtpConfig.secure} from=${this.smtpConfig.from}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `SMTP verify failed (mail may still work on send): host=${this.smtpConfig.host} error=${message}`,
      );
    }
  }
}
