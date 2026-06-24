function renderX402Overview(data) {
  if (!data) return '<div class="meta">Loading X402 Agent System...</div>';
  const syncedAt=new Date(data.stats.latestBlockTimestamp||data.generatedAt);
  const syncLabel=Number.isNaN(syncedAt.getTime())?"Latest indexed snapshot":`Indexed ${syncedAt.toLocaleString([], {dateStyle:"medium",timeStyle:"short"})}`;
  return `<div class="x402-shell">
    <div class="x402-mode"><span class="mode-mark"></span><span class="badge">PUBLIC NETWORK DATA</span><span class="meta">${x402Escape(syncLabel)} · ${x402Escape(data.stats.sourceLabel)}</span><a class="x402-source" href="${x402Escape(data.stats.sourceUrl)}" target="_blank" rel="noreferrer">View source ↗</a></div>
    <div class="x402-charts">
      ${x402MetricChart("Transactions",data.stats.totals.transactions,data.stats.transactions,"count")}
      ${x402MetricChart("Volume",data.stats.totals.volume,data.stats.volume,"currency")}
      ${x402MetricChart("Buyers",data.stats.totals.buyers,data.stats.buyers,"count")}
      ${x402MetricChart("Sellers",data.stats.totals.sellers,data.stats.sellers,"count")}
    </div>
    <div class="x402-grid">
      <section class="x402-panel"><div class="x402-panel-head"><h3>Indexed Resources</h3><span class="meta">x402scan · ${data.resources.length} selected endpoints</span></div><div class="x402-panel-body"><div class="resource-list">
        ${data.resources.map((resource)=>{const endpoint=resource.endpoints[0];return `<a class="resource-row" href="${x402Escape(resource.sourceUrl||resource.baseUrl)}" target="_blank" rel="noreferrer"><div><b>${x402Escape(resource.name)}</b><div class="capabilities">${resource.capabilities.map((item)=>`<span class="capability">${x402Escape(item)}</span>`).join("")}</div></div><span class="pill">${x402Escape(resource.category)}</span><span class="meta">${x402Escape(endpoint.method)} ${x402Escape(endpoint.path)}</span><span class="resource-price">${formatX402Money(endpoint.pricing.unitAmount)}<small> ${x402Escape(endpoint.pricing.currency)}</small></span></a>`}).join("")}
      </div></div></section>
      <section class="x402-panel"><div class="x402-panel-head"><h3>Execution Lifecycle</h3><span class="meta">${x402Escape(data.protocol.version)} · ${x402Escape(data.protocol.networks.join(" + "))}</span></div><div class="x402-panel-body">
        <div class="x402-flow">
          ${data.protocol.stages.map((stage,index)=>x402Step(String(index+1).padStart(2,"0"),stage.title,stage.description,stage.status)).join("")}
        </div>
        <div class="budget-grid"><div class="budget-cell"><span>Settlement asset</span><b>${x402Escape(data.protocol.settlementAsset)}</b></div><div class="budget-cell"><span>Networks</span><b>${x402Escape(data.protocol.networks.join(" + "))}</b></div><div class="budget-cell"><span>Resources shown</span><b>${data.resources.length}</b></div></div>
      </div></section>
    </div>
    <p class="trade-disclaimer">Network totals and activity are sourced from the public x402scan index. GitHub Pages displays the most recently synchronized snapshot; the local dashboard refreshes the source periodically.</p>
  </div>`;
}
function x402MetricChart(label,total,series,kind){const latest=series.at(-1)?.value||0,previous=series.at(-2)?.value||latest||1,max=Math.max(1,...series.map(item=>item.value)),delta=((latest/previous-1)*100),deltaLabel=`${delta>=0?"+":""}${delta.toFixed(1)}%`;return `<article class="metric-chart"><div class="metric-chart-head"><div><h4>${label}</h4><span class="metric-value">${formatX402Metric(total,kind)}</span><span class="metric-period">Network total</span></div><span class="metric-delta ${delta<0?"negative":""}">${deltaLabel}</span></div><div class="spark-bars">${series.map(item=>`<span class="spark-bar" style="height:${Math.max(5,item.value/max*100)}%" title="${x402Escape(item.period)} ${formatX402Metric(item.value,kind)}"></span>`).join("")}</div><div class="spark-labels"><span>${x402Escape(series[0]?.period||"")}</span><span>${x402Escape(series.at(-1)?.period||"")}</span></div></article>`;}
function x402Step(index,title,description,status){return `<div class="x402-step"><span class="step-index">${index}</span><div><b>${x402Escape(title)}</b><p>${x402Escape(description)}</p></div><span class="step-status">${x402Escape(status)}</span></div>`;}
function formatX402Metric(value,kind){const prefix=kind==="currency"?"$":"";if(value>=1e6)return `${prefix}${(value/1e6).toFixed(2)}M`;if(value>=1e3)return `${prefix}${(value/1e3).toFixed(value<100000?1:2)}K`;return `${prefix}${value}`;}
function formatX402Money(value){return `$${Number(value).toFixed(value<0.01?5:3)}`;}
function x402Escape(value){return h(String(value??""));}
