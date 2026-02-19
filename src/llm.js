const http = require('node:http');
const https = require('node:https');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/';
const DEFAULT_MODEL = 'minimax/minimax-m2.5';
const DEFAULT_TEMPERATURE = 0.2;

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function resolveLLMConfig({ env = process.env, overrides = {} } = {}) {
  const apiKey = overrides.apiKey || env.SCRIBE_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Set SCRIBE_OPENAI_API_KEY or OPENAI_API_KEY to use git-scribe.');
  }
  const baseUrl = ensureTrailingSlash(
    overrides.baseUrl || env.SCRIBE_OPENAI_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
  );
  const model = overrides.model || env.SCRIBE_OPENAI_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

function postJson(url, { headers = {}, body }) {
  const data = JSON.stringify(body);
  const endpoint = new URL(url);
  const client = endpoint.protocol === 'https:' ? https : http;
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = client.request(endpoint, requestOptions, (res) => {
      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const payload = chunks.join('');
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(payload));
          } catch (error) {
            reject(new Error(`Failed to parse LLM response: ${error.message}`));
          }
          return;
        }
        reject(new Error(`LLM request failed with status ${res.statusCode}: ${payload}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function generateCommitMessage({ prompt, config, temperature = DEFAULT_TEMPERATURE }) {
  const { apiKey, baseUrl, model } = config;
  const url = new URL('chat/completions', ensureTrailingSlash(baseUrl));
  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };

  const response = await postJson(url.toString(), {
    headers,
    body: {
      model,
      temperature,
      messages: [
        {
          role: 'system',
          content:
            'You draft accurate git commit messages from staged diffs. Do not hallucinate, keep the subject under 72 characters, and mirror the repository\'s style.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    },
  });

  const message = response?.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error('LLM response did not include a commit message.');
  }
  return {
    message: message.trim(),
    raw: response,
  };
}

module.exports = {
  resolveLLMConfig,
  generateCommitMessage,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
};
