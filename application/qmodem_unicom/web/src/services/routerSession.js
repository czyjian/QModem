import { postJson } from './unicomApi';
import { UNICOM_API_BASE_URL } from '../config/unicom';
export const ROUTER_TOKEN = 'qmodem-router-shared-session-reference';
export function sharedSession(action, data = {}) {
  return postJson(`${UNICOM_API_BASE_URL}/shared/`, {action,...data});
}
export async function initializeSharedAccount(accountStore) {
  accountStore.initializeAccounts();
  let status = await sharedSession('status');
  if (!status.ok) throw new Error(status.msg || '无法读取路由器登录状态');
  if (!status.logged_in) {
    const legacy = accountStore.currentAccount.value;
    if (legacy?.token && legacy.token !== ROUTER_TOKEN) {
      const result = await sharedSession('import',{ecs_token:legacy.token,cookie:legacy.cookie || '',phone:legacy.phone || ''});
      if (result.ok) status = await sharedSession('status');
    }
  }
  // Real carrier tokens now belong to the router, not browser storage.
  accountStore.replaceWithShared(status.logged_in ? status : null);
  return status;
}
