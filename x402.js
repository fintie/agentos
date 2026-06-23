function renderX402Overview(data) {
  if (!data) return '<div class="meta">Loading X402 Agent System...</div>';
  const lifecycle=data.lifecycle;
  return `<div class="x402-shell">
    <div class="x402-mode"><span class="mode-mark"></span><span class="badge">MOCK / NO CHAIN</span><span class="meta">Deterministic protocol simulation · no wallet · no irreversible payment</span></div>
    <div class="x402-charts">
      ${x402MetricChart("Transactions",data.stats.transactions,"count")}
      ${x402MetricChart("Volume",data.stats.volume,"currency")}
      ${x402MetricChart("Buyers",data.stats.buyers,"count")}
      ${x402MetricChart("Sellers",data.stats.sellers,"count")}
    </div>
    <div class="x402-grid">
      <section class="x402-panel"><div class="x402-panel-head"><h3>Resource Marketplace</h3><span class="meta">/.well-known/x402 · ${data.resources.length} resources</span></div><div class="x402-panel-body"><div class="resource-list">
        ${data.resources.map((resource)=>{const endpoint=resource.endpoints[0];return `<div class="resource-row"><div><b>${x402Escape(resource.name)}</b><div class="capabilities">${resource.capabilities.map((item)=>`<span class="capability">${x402Escape(item)}</span>`).join("")}</div></div><span class="pill">${x402Escape(resource.category)}</span><span class="meta">${Math.round(resource.reliabilityScore*100)}% reliable</span><span class="resource-price">${formatX402Money(endpoint.pricing.unitAmount)}<small>/${x402Escape(endpoint.pricing.unit)}</small></span></div>`}).join("")}
      </div></div></section>
      <section class="x402-panel"><div class="x402-panel-head"><h3>Execution Lifecycle</h3><span class="meta">quote-bound receipt</span></div><div class="x402-panel-body">
        <div class="x402-flow">
          ${x402Step("01","Discover","Resource manifest selected by capability, health, proof and price.",lifecycle.resource.resourceId)}
          ${x402Step("02","402 Quote",`${lifecycle.quote.pricingUnit} · max ${formatX402Money(lifecycle.quote.authorizedMaximum)}`,lifecycle.quote.quoteId)}
          ${x402Step("03","Authorize",`Budget policy ${lifecycle.authorization.budgetPolicyId}`,lifecycle.authorization.status)}
          ${x402Step("04","Execute + Prove","Output, token, execution receipt and evaluation hashes bound.",lifecycle.binding.executionReceiptHash.slice(0,12))}
          ${x402Step("05","Settle",`${formatX402Money(lifecycle.settlement.actualAmount)} ${lifecycle.settlement.currency}`,lifecycle.settlement.settlementStatus)}
        </div>
        <div class="budget-grid"><div class="budget-cell"><span>Quoted</span><b>${formatX402Money(lifecycle.quote.estimatedAmount)}</b></div><div class="budget-cell"><span>Authorized max</span><b>${formatX402Money(lifecycle.authorization.authorizedMaximum)}</b></div><div class="budget-cell"><span>Actual</span><b>${formatX402Money(lifecycle.settlement.actualAmount)}</b></div></div>
      </div></section>
    </div>
    <p class="trade-disclaimer">Benchmark charts are deterministic ecosystem demo data inspired by public x402 activity, not a live x402scan feed. Production payment adapters remain feature-gated.</p>
  </div>`;
}
function x402MetricChart(label,series,kind){const latest=series.at(-1).value,previous=series.at(-2).value,max=Math.max(...series.map(item=>item.value)),delta=((latest/previous-1)*100).toFixed(1);return `<article class="metric-chart"><div class="metric-chart-head"><div><h4>${label}</h4><span class="metric-value">${formatX402Metric(latest,kind)}</span></div><span class="metric-delta">+${delta}%</span></div><div class="spark-bars">${series.map(item=>`<span class="spark-bar" style="height:${Math.max(5,item.value/max*100)}%" title="${x402Escape(item.period)} ${formatX402Metric(item.value,kind)}"></span>`).join("")}</div><div class="spark-labels"><span>${series[0].period}</span><span>${series.at(-1).period}</span></div></article>`;}
function x402Step(index,title,description,status){return `<div class="x402-step"><span class="step-index">${index}</span><div><b>${x402Escape(title)}</b><p>${x402Escape(description)}</p></div><span class="step-status">${x402Escape(status)}</span></div>`;}
function formatX402Metric(value,kind){const prefix=kind==="currency"?"$":"";if(value>=1e6)return `${prefix}${(value/1e6).toFixed(2)}M`;if(value>=1e3)return `${prefix}${(value/1e3).toFixed(value<100000?1:2)}K`;return `${prefix}${value}`;}
function formatX402Money(value){return `$${Number(value).toFixed(value<0.01?5:3)}`;}
function x402Escape(value){return h(String(value??""));}
