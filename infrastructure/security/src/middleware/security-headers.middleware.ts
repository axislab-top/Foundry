/**
 * 安全响应头中间件（Express）
 */

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  xXssProtection?: string;
  strictTransportSecurity?: string;
  referrerPolicy?: string;
}

const defaultOptions: SecurityHeadersOptions = {
  contentSecurityPolicy: "default-src 'self'",
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  xXssProtection: '1; mode=block',
  strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  referrerPolicy: 'strict-origin-when-cross-origin',
};

export function securityHeadersMiddleware(
  options: SecurityHeadersOptions = {},
): (req: any, res: any, next: any) => void {
  const opts = { ...defaultOptions, ...options };

  return (_req: any, res: any, next: any) => {
    if (opts.contentSecurityPolicy) {
      res.setHeader('Content-Security-Policy', opts.contentSecurityPolicy);
    }
    if (opts.xFrameOptions) {
      res.setHeader('X-Frame-Options', opts.xFrameOptions);
    }
    if (opts.xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', opts.xContentTypeOptions);
    }
    if (opts.xXssProtection) {
      res.setHeader('X-XSS-Protection', opts.xXssProtection);
    }
    if (opts.strictTransportSecurity) {
      res.setHeader('Strict-Transport-Security', opts.strictTransportSecurity);
    }
    if (opts.referrerPolicy) {
      res.setHeader('Referrer-Policy', opts.referrerPolicy);
    }

    next();
  };
}






































