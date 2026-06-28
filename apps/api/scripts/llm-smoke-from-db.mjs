#!/usr/bin/env node
/**
 * 从 PostgreSQL 读取活跃 LLM Key（与 API 相同 AES 解密），依次尝试直到 chat 有正常返回。
 * 在 apps/api 目录执行:
 *   node --env-file=.env scripts/llm-smoke-from-db.mjs
 *
 * 可选: LIMIT=20 MODEL_FILTER=gpt
 */
import { Client } from 'pg';
import { createHash, createDecipheriv } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(p) {
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(join(__dirname, '../.env'));

async function decryptLlmSecret(encryptedBase64, passphrase) {
  const combined = JSON.parse(Buffer.from(encryptedBase64, 'base64').toString('utf8'));
  const enc = Buffer.from(combined.encrypted, 'base64');
  const iv = Buffer.from(combined.iv, 'base64');
  const tag = Buffer.from(combined.tag, 'base64');
  const key = createHash('sha256').update(passphrase).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

async function callOpenAiCompat(baseUrl, apiKey, modelName) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      max_tokens: 80,
      messages: [
        { role: 'system', content: 'You are a test assistant. Reply with exactly: OK' },
        { role: 'user', content: 'ping' },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let content = '';
  try {
    const j = JSON.parse(text);
    content = j?.choices?.[0]?.message?.content ?? j?.error?.message ?? text;
  } catch {
    content = text;
  }
  return { ok: res.ok, status: res.status, url, content: String(content).slice(0, 500), rawHead: text.slice(0, 350) };
}

async function callAnthropic(baseUrl, apiKey, modelName) {
  const raw = String(baseUrl || '').replace(/\/$/, '');
  const root = raw.replace(/\/v1$/, '');
  const url = `${root}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 80,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let content = '';
  try {
    const j = JSON.parse(text);
    const block = j?.content?.[0];
    content = block?.text ?? j?.error?.message ?? text;
  } catch {
    content = text;
  }
  return { ok: res.ok, status: res.status, url, content: String(content).slice(0, 500), rawHead: text.slice(0, 350) };
}

function inferKind(row) {
  const k = (row.kind || '').toLowerCase();
  if (k === 'anthropic') return 'anthropic';
  if ((row.model_name || '').toLowerCase().includes('claude')) return 'anthropic';
  return 'openai';
}

async function main() {
  const aesKey = process.env.AES_KEY || '';
  if (!aesKey) {
    throw new Error('AES_KEY 未设置。请在 apps/api 下执行: node --env-file=.env scripts/llm-smoke-from-db.mjs');
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || 'postgres';
  const database = process.env.DB_DATABASE || 'service_db';
  const limit = Math.min(200, Math.max(1, parseInt(process.env.LIMIT || '40', 10) || 40));
  const modelFilter = (process.env.MODEL_FILTER || '').trim();

  const db = new Client({ host, port, user, password, database });
  await db.connect();

  let sql = `
    select k.id, k.encrypted_secret, k.model_name, k.provider, k.key_alias,
           p.request_url, p.kind
    from llm_keys k
    left join llm_providers p on p.code = k.provider
    where k.is_active = true
  `;
  const params = [];
  if (modelFilter) {
    params.push(`%${modelFilter}%`);
    sql += ` and k.model_name ilike $${params.length}`;
  }
  sql += ` order by k.updated_at desc nulls last`;

  params.push(limit);
  sql += ` limit $${params.length}`;
  const r = await db.query(sql, params);
  await db.end();

  console.error(`[llm-smoke] 数据库 ${database}@${host} 活跃密钥候选: ${r.rows.length} 条 (limit=${limit})`);

  if (!r.rows.length) {
    console.log(JSON.stringify({ success: false, error: 'no_active_keys' }, null, 2));
    process.exit(2);
  }

  const errors = [];

  for (const row of r.rows) {
    const id = row.id;
    const modelName = String(row.model_name || '');
    let requestUrl = (row.request_url && String(row.request_url).trim()) || '';
    const kind = inferKind(row);

    if (kind === 'openai' && !requestUrl) {
      errors.push({ id, modelName, step: 'skip', reason: 'openai_compat_missing_provider_request_url' });
      continue;
    }

    if (kind === 'anthropic' && !requestUrl) {
      requestUrl = 'https://api.anthropic.com';
    }

    let apiKey;
    try {
      apiKey = await decryptLlmSecret(row.encrypted_secret, aesKey);
    } catch (e) {
      errors.push({ id, modelName, step: 'decrypt', error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    if (!apiKey?.trim()) {
      errors.push({ id, modelName, step: 'decrypt', error: 'empty_secret' });
      continue;
    }

    try {
      const result =
        kind === 'anthropic'
          ? await callAnthropic(requestUrl, apiKey, modelName)
          : await callOpenAiCompat(requestUrl, apiKey, modelName);

      if (result.ok) {
        const out = {
          success: true,
          llmKeyId: id,
          keyAlias: row.key_alias,
          provider: row.provider,
          modelName,
          kind,
          requestUrl,
          llmResponsePreview: result.content,
        };
        console.log(JSON.stringify(out, null, 2));
        return;
      }

      errors.push({
        id,
        modelName,
        kind,
        step: 'http',
        status: result.status,
        url: result.url,
        bodyPreview: result.rawHead,
      });
    } catch (e) {
      errors.push({
        id,
        modelName,
        kind,
        step: 'fetch',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        success: false,
        message: '所有候选密钥均未返回成功，请检查 provider.request_url、密钥是否有效、网络与模型名。',
        tried: errors.length,
        errors,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
