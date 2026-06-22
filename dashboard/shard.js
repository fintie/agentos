function renderDistributedInference(data) {
  if (!data) return '<div class="meta">Loading distributed inference data...</div>';
  const allReceipts = [
    ...data.normalReceipts,
    ...data.runs.map((run) => ({
      ...run.receipt, backend:"sharded", payoutEstimate:run.settlements.reduce((sum,item)=>sum+item.amount,0), settlementStatus:run.settlements.every((item)=>item.settlementStatus==="eligible")?"eligible":"withheld",
    })),
  ];
  return `<div class="dist-shell">
    <div class="dist-heading"><div><h3>Distributed Inference</h3><p>Deterministic WAN shard orchestration simulation. No real GPU or activation traffic.</p></div><span class="badge">${data.runs.length} ACTIVE TOPOLOGIES</span></div>
    <div class="topology-grid">${data.runs.map(renderTopologyCard).join("")}</div>
    <div class="dist-heading" style="margin-top:22px"><div><h3>Receipts &amp; Settlement</h3><p>Unified provider, local, and sharded run provenance with payout estimates.</p></div><span class="badge">${allReceipts.length} RECEIPTS</span></div>
    <div class="receipt-table-wrap"><table class="receipt-table"><thead><tr><th>Backend</th><th>Task / agent</th><th>Model</th><th>Output hash</th><th>Token hash</th><th>Eval</th><th>Verification</th><th>Payout</th><th>Settlement</th></tr></thead><tbody>
      ${allReceipts.map((receipt) => `<tr><td><span class="pill">${shardEscape(receipt.backend)}</span></td><td><b>${shardEscape(receipt.taskId)}</b><div class="meta">${shardEscape(receipt.agentName)}</div></td><td>${shardEscape(receipt.modelName)}</td><td><span class="hash" title="${shardEscape(receipt.outputHash)}">${shardEscape(receipt.outputHash)}</span></td><td><span class="hash" title="${shardEscape(receipt.tokenHash)}">${shardEscape(receipt.tokenHash)}</span></td><td>${Math.round((receipt.evaluationScore||0)*100)}%</td><td class="${receipt.verificationStatus==="failed"?"verify-fail":"verify-ok"}">${shardEscape(receipt.verificationStatus||"verified")}</td><td>${Number(receipt.payoutEstimate||0).toFixed(6)}</td><td>${shardEscape(receipt.settlementStatus)}</td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
}

function renderTopologyCard(run,index) {
  const topology=run.topology, simulation=run.simulation, receipt=run.receipt;
  const total=run.settlements.reduce((sum,item)=>sum+item.amount,0)||1;
  const colors=["#70dca4","#72cbed","#edbd72","#bd98e8","#ef8ca0","#7ca8ed","#a5dc70","#e6d26f"];
  return `<article class="topology-card"><div class="topology-head"><div><h4>${shardEscape(topology.modelName)}</h4><span class="topology-meta">${topology.totalLayers} layers · ${topology.shardNodes.length} shards · coordinator ${shardEscape(topology.coordinatorNodeId)}</span></div><span class="${receipt.verificationStatus==="verified"?"verify-ok":"verify-fail"}">${shardEscape(receipt.verificationStatus)}</span></div><div class="topology-body">
    <div class="layer-strip">${topology.shardNodes.map((node)=>`<div class="layer-block" style="width:${(node.layerEnd-node.layerStart+1)/topology.totalLayers*100}%" title="${shardEscape(node.nodeId)}">${node.layerStart}-${node.layerEnd}</div>`).join("")}</div>
    <div class="topology-flags">${topology.speculativeDecodingEnabled?'<span class="dist-flag">SPECULATIVE</span>':''}${topology.asyncPipeliningEnabled?'<span class="dist-flag">ASYNC PIPELINE</span>':''}${topology.directReturnEnabled?'<span class="dist-flag">DIRECT RETURN</span>':''}<span class="dist-flag">DETERMINISTIC</span></div>
    <div class="edge-list">${simulation.edgeRtts.map((edge)=>`<span class="edge">${shardEscape(shortNode(edge.fromNodeId))}→${shardEscape(shortNode(edge.toNodeId))} ${edge.rttMs}ms</span>`).join("")}</div>
    <div class="dist-stats"><div class="dist-stat"><b>${simulation.throughputTokPerSec}</b><span>tok/s</span></div><div class="dist-stat"><b>${simulation.latencyMs.toFixed(0)}ms</b><span>latency</span></div><div class="dist-stat"><b>${simulation.acceptedDraftTokens}</b><span>draft accepted</span></div><div class="dist-stat"><b>${simulation.retryCount}</b><span>retries</span></div></div>
    <div class="node-health">${topology.shardNodes.map((node)=>`<div class="node-row"><span><i class="health-dot ${node.healthStatus}"></i>${shardEscape(node.nodeId)}</span><span>${shardEscape(node.region)}</span><span>${shardEscape(node.gpuType.replace(" Mock",""))}</span><span>${Math.round(node.reliabilityScore*100)}%</span></div>`).join("")}</div>
    <div class="settlement-bar" style="margin-top:11px">${run.settlements.map((item,i)=>`<span title="${shardEscape(item.nodeId)} ${item.amount}" style="width:${item.amount/total*100}%;background:${colors[i%colors.length]}"></span>`).join("")}</div>
    <div class="settlement-detail">${run.settlements.map((item)=>`<div class="payout-row"><span>${shardEscape(item.role)} · ${shardEscape(shortNode(item.nodeId))}</span><strong>${item.amount.toFixed(6)}</strong></div>`).join("")}</div>
  </div></article>`;
}
function shortNode(value){const parts=String(value).split("-");return parts.slice(-2).join("-");}
function shardEscape(value){return h(String(value??""));}
