# Security Policy

> 📖 [中文版安全政策](SECURITY.zh-CN.md)

## Reporting Vulnerabilities

If you discover a security vulnerability, please **do NOT** open a public issue.

Instead, email **postmaster@axislab.top** with:

1. Vulnerability description
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)

We will acknowledge receipt within **48 hours** and provide a fix plan within **7 business days**.

## Supported Versions

| Version | Support Status |
|---------|---------------|
| Latest main branch | ✅ Supported |
| Older versions | ❌ Not supported |

## Security Best Practices

When deploying Foundry, ensure:

- [ ] Change all default passwords (JWT_SECRET, DB_PASSWORD, DEFAULT_ADMIN_PASSWORD)
- [ ] Use strong random keys (`openssl rand -base64 32`)
- [ ] Disable TEST_AUTH_ENABLED in production
- [ ] Disable SWAGGER_ENABLED in production
- [ ] Set DB_SYNCHRONIZE to false in production
- [ ] Use HTTPS
- [ ] Configure firewall to expose only necessary ports
- [ ] Regularly update dependencies (`pnpm update`)

## Known Security Notes

- `TEST_AUTH_ENABLED=true` allows injecting arbitrary user identity via headers — **dev environment only**
- Default admin password is `changeme` — **must be changed in production**
- RabbitMQ uses `guest:guest` by default — **must be changed in production**

## Acknowledgments

We thank all researchers who responsibly report security issues.
