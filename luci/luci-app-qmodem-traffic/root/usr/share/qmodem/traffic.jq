# One update per sample; counters are per unique L3 device, never per IP family.
($sample[0]) as $s |
(. // {}) as $old |
([$s.devices[] | . as $d |
  ($old.devices // [] | map(select(.name == $d.name and .index == $d.index)) | first) as $p |
  if $old.boot == $s.boot and $p != null and $d.rx >= $p.rx and $d.tx >= $p.tx
  then {rx: ($d.rx - $p.rx), tx: ($d.tx - $p.tx)} else {rx: 0, tx: 0} end
] | {rx: (map(.rx)|add // 0), tx: (map(.tx)|add // 0)}) as $delta |
((if $old.boot == $s.boot then $s.uptime - ($old.uptime // $s.uptime) else 0 end)) as $elapsed |
(if $old.cycle == $s.cycle then
  $old.cycle_carriers // {unknown:(($old.cycle_rx // 0)+($old.cycle_tx // 0))}
 else {} end) as $carriers |
(if $old.carrier == $s.carrier and (["unicom","mobile","telecom"] | index($s.carrier)) != null then $s.carrier else "unknown" end) as $carrier |
(if $old.cycle == $s.cycle then $old.cycle_sims // {} else {} end |
  if ($s.sim_key // "") != "" and $old.sim_key == $s.sim_key then
    .[$s.sim_key] = ((.[$s.sim_key] // {rx:0,tx:0}) | .rx += $delta.rx | .tx += $delta.tx)
  else . end) as $sims |
($s + {
  cycle_sims: $sims,
  sim_cycle_rx: (if ($s.sim_key // "") != "" then $sims[$s.sim_key].rx // 0 else null end),
  sim_cycle_tx: (if ($s.sim_key // "") != "" then $sims[$s.sim_key].tx // 0 else null end),
  cycle_carriers: ($carriers | .[$carrier] = ((.[$carrier] // 0)+$delta.rx+$delta.tx)),
  total_rx: (($old.total_rx // 0) + $delta.rx),
  total_tx: (($old.total_tx // 0) + $delta.tx),
  cycle_rx: ((if $old.cycle == $s.cycle then $old.cycle_rx // 0 else 0 end) + $delta.rx),
  cycle_tx: ((if $old.cycle == $s.cycle then $old.cycle_tx // 0 else 0 end) + $delta.tx),
  rx_rate: (if $elapsed > 0 then $delta.rx / $elapsed else 0 end),
  tx_rate: (if $elapsed > 0 then $delta.tx / $elapsed else 0 end),
  since: ($old.since // $s.now),
  daily: (($old.daily // {}) | .[$s.day] = ((.[$s.day] // {rx:0,tx:0}) | .rx += $delta.rx | .tx += $delta.tx) | to_entries | sort_by(.key) | .[-400:] | from_entries),
  monthly: (($old.monthly // {}) | .[$s.month] = ((.[$s.month] // {rx:0,tx:0}) | .rx += $delta.rx | .tx += $delta.tx) | to_entries | sort_by(.key) | .[-24:] | from_entries)
}) as $new |
$new + {live: ((if $old.boot == $s.boot then $old.live // [] else [] end) as $live |
  if ($live|length)==0 or $s.now - $live[-1].time >= 10
  then ($live + [{time:$s.now,rx:$new.rx_rate,tx:$new.tx_rate}] | .[-120:]) else $live end)}
