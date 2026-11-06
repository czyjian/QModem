import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseCookieHeader } from './upstream/cookies.js';

export const ROUTER_TOKEN = 'qmodem-router-shared-session-reference';
export function contextKey(context) {
  if (!context || !/^[A-Za-z0-9_]{1,64}$/.test(context.section || '') || !/^[0-9]{10,32}$/.test(context.identity || '')) return '';
  return createHash('sha256').update(context.section + ':' + context.identity).digest('hex');
}
export function createSessionStore(path = '') {
  let sessions = {};
  if (path) {
    try { sessions = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('无法读取联通会话存储'); }
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) throw new Error('联通会话存储格式错误');
  }
  function persist() {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(path), 0o700);
    const temporary = path + '.tmp';
    writeFileSync(temporary, JSON.stringify(sessions), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  }
  function get(context) { const key = contextKey(context); return key ? sessions[key] || null : null; }
  function put(context, session, phone = '') {
    const key = contextKey(context);
    if (!key) throw new Error('SIM 卡上下文无效');
    const token = session.ecsToken;
    if (typeof token !== 'string' || token.length <= 20 || token.length > 4096 || /[^\x21-\x7e]|[;",\\]/.test(token) || token === ROUTER_TOKEN) throw new Error('登录会话无效');
    const cookie = session.cookie || '';
    if (!parseCookieHeader(cookie)) throw new Error('登录会话格式错误');
    // Passwords, SMS codes and verification challenges never enter this file.
    const entry = { ecsToken: token, cookie, mobile: /^1\d{10}$/.test(phone) ? phone.slice(0,3) + '****' + phone.slice(-4) : '', updatedAt: Date.now() };
    const previous = sessions;
    sessions = { ...sessions, [key]: entry };
    const keys = Object.keys(sessions).sort((a,b) => sessions[b].updatedAt - sessions[a].updatedAt);
    sessions = Object.fromEntries(keys.slice(0,16).map(k => [k,sessions[k]]));
    try { persist(); } catch { sessions = previous; throw new Error('无法保存联通登录会话'); }
    return entry;
  }
  function remove(context) {
    const key = contextKey(context), previous = sessions;
    sessions = { ...sessions }; delete sessions[key];
    try { persist(); } catch { sessions = previous; throw new Error('无法清除联通登录会话'); }
  }
  return { get, put, remove };
}
