import assert from 'node:assert/strict';
import { test } from 'node:test';
import { networkSummary } from '../src/network-summary.js';
test('contracted rate takes the highest explicit source independently of QCI',()=>{
  assert.deepEqual(networkSummary({rate_mbps:300},{max_net_mbps:1000,services:[{downlink_mbps:2000}],qci_num:8}),{signed_rate:'2000 Mbps',qci:'8'});
});
test('inferred QCI is labelled and requires an actual returned service list',()=>{
  assert.equal(networkSummary(null,{has_service_list:true,network_quality_services:['VVIP']}).qci,'6（推断）');
  assert.equal(networkSummary(null,{has_service_list:true,network_quality_services:['VIP']}).qci,'8（推断）');
  assert.equal(networkSummary(null,{has_service_list:true,network_quality_services:[]}).qci,'9（推断）');
  assert.equal(networkSummary(null,null).qci,'—');
  assert.equal(networkSummary(null,{network_quality_services:['VIP']}).qci,'—');
});
test('invalid fields do not invent contract rates or direct QCI',()=>{
  assert.deepEqual(networkSummary({rate_mbps:true},{qci_num:300}),{signed_rate:'—',qci:'—'});
  assert.equal(networkSummary({rate_is_lte:true},null).signed_rate,'LTE');
});
