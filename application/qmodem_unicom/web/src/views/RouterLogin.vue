<script setup>
import { onMounted, ref } from 'vue';
import LoginDialog from '@/components/LoginDialog.vue';
import { useAccounts } from '@/composables/useAccounts';
import { usePrivacy } from '@/composables/usePrivacy';
import { initializeSharedAccount, sharedSession } from '@/services/routerSession';
const open = ref(false), notice = ref('正在读取路由器登录状态…'), complete = ref(false);
const accounts = useAccounts();
const { openPrivacy } = usePrivacy();
const detailUrl = '/qmodem-unicom/?modem=' + encodeURIComponent(new URLSearchParams(location.search).get('modem') || '');
async function authenticated(payload) {
  // Phone/password login was saved by the backend before returning success.
  // Keep this page free of carrier credentials, including old browser copies.
  const status = await sharedSession('status');
  accounts.replaceWithShared(status.logged_in ? status : null);
  if (!status.logged_in) { notice.value='登录状态尚未保存，请重试'; return; }
  open.value = false; complete.value = true;
  notice.value = '联通登录已保存在路由器。其他已登录 LuCI 的浏览器也可直接查询，可以关闭此窗口。';
}
onMounted(async () => {
  try {
    const status = await initializeSharedAccount(accounts);
    if (status.logged_in) await authenticated();
    else { notice.value='请手动完成联通要求的安全验证。'; open.value=true; }
  } catch(e) { notice.value=e.message; }
});
</script>
<template>
  <main class="p-5">
    <p role="status">{{ notice }}</p>
    <a v-if="complete" :href="detailUrl">查看详细信息</a>
    <LoginDialog v-model:open="open" :notice="notice" @authenticated="authenticated" @open-privacy="openPrivacy" />
  </main>
</template>
