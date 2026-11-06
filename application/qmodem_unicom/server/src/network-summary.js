// Match the detail page's domain/usage.js rules: the contracted downlink rate
// and QCI are independent. Never infer QCI without a returned service list.
export function networkSummary(basic, services) {
  const positive=value=>['string','number'].includes(typeof value) && Number.isFinite(Number(value)) && Number(value)>0 ? Number(value) : 0;
  const rate=Math.max(positive(basic?.rate_mbps),positive(services?.max_net_mbps),...(services?.services || []).map(item=>positive(item.downlink_mbps)));
  const signed_rate=rate ? Number(rate.toFixed(3))+' Mbps' : basic?.rate_is_lte ? 'LTE' : '—';
  const direct=positive(services?.qci_num);
  let qci='—';
  if(Number.isInteger(direct) && direct>0 && direct<=255) qci=String(direct);
  else if(services?.has_service_list === true) {
    const quality=(services.network_quality_services || []).map(value=>String(value).trim().toUpperCase());
    qci=String(quality.includes('VVIP') ? 6 : quality.includes('VIP') ? 8 : 9)+'（推断）';
  }
  return {signed_rate,qci};
}
