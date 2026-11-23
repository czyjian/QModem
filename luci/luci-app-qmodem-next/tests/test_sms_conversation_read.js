const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/qmodem/sms_conversation.js'), 'utf8');
const calls = [];
const messages = [
  { id: 1, type: 'received', is_read: false },
  { id: 2, type: 'sent', is_read: false },
  { id: 3, type: 'received', is_read: true },
  { id: 4, type: 'received', is_read: false, part_ids: [4, 5, 4] }
];
const smsService = {
  getConversation: async () => ({ messages }),
  markRead: async (modem, ids) => { calls.push({ modem, ids }); }
};
const document = { hidden: false, head: { appendChild() {} } };
const view = new Function('view', 'smsService', 'document', 'E', 'L', '_', source)(
  { extend: x => x }, smsService, document, () => ({}),
  { resource: x => x, env: {} }, x => x);
view.replyModem = 'modem1';
view.replyAddress = { update() {} };
view.renderMessages = () => {};
const area = { isConnected: true };
(async () => {
  await view.pollConversation(area, 'modem1', '10000');
  assert.deepStrictEqual(calls, [{ modem: 'modem1', ids: [1, 4, 5] }], 'polling must mark incoming unread messages, including multipart IDs, as read');
  await view.pollConversation(area, 'another_modem', '10000');
  assert.strictEqual(calls.length, 1, 'stale modem response must not mark messages');
  document.hidden = true;
  await view.pollConversation(area, 'modem1', '10000');
  assert.strictEqual(calls.length, 1, 'hidden conversation must not mark new messages as read');
  document.hidden = false;
  area.isConnected = false;
  await view.pollConversation(area, 'modem1', '10000');
  assert.strictEqual(calls.length, 1, 'detached conversation must not mark messages as read');
  console.log('PASS: visible conversation polling marks incoming messages read without marking sent, hidden or stale messages');
})().catch(err => { console.error(err); process.exit(1); });
