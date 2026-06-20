const tradingViews = [
  ["watchlist", "Watchlist"], ["signals", "Signals"], ["backtests", "Backtests"],
  ["portfolio", "Portfolio"], ["news", "News"], ["activity", "Agent Activity"],
];

function renderTrading(view) {
  const snapshot = state.trading;
  if (!snapshot) { $("#main").innerHTML = '<div class="meta">Loading trading workspace...</div>'; return; }
  const selected = view.replace("trading:", "");
  const active = snapshot.signals.filter((signal) => signal.status === "actionable");
  $("#main").innerHTML = `<div class="trading-shell">
    <div class="trading-head">
      <div class="trading-title"><span class="market-mark">TA</span><div><h2>Trading Agent OS</h2><p>Multi-market discovery, validation, risk and portfolio intelligence</p></div></div>
      <div class="trading-status"><span class="live-dot"></span><span class="badge">${e(snapshot.mode).toUpperCase()} DATA</span><span class="badge">US ${e(snapshot.schedule.US)}</span><span class="badge">ASX ${e(snapshot.schedule.ASX)}</span></div>
    </div>
    <div class="trade-tabs">${tradingViews.map(([id,label]) => `<button class="${selected === id ? "active" : ""}" onclick="state.view='trading:${id}';render()">${label}</button>`).join("")}</div>
    <div class="trade-kpis">
      ${tradeKpi(snapshot.signals.length, "Candidates", "US + ASX scan")}
      ${tradeKpi(active.length, "Actionable", "Passed strategy and risk")}
      ${tradeKpi(snapshot.signals.filter((s) => s.risk.accepted).length, "Risk approved", "Minimum 2.0 RR")}
      ${tradeKpi(Math.max(...snapshot.signals.map((s) => s.confidence)) + "%", "Top confidence", snapshot.signals[0].symbol)}
    </div>
    ${selected === "watchlist" ? tradingWatchlist(snapshot) : ""}
    ${selected === "signals" ? tradingSignals(snapshot) : ""}
    ${selected === "backtests" ? tradingBacktests(snapshot) : ""}
    ${selected === "portfolio" ? tradingPortfolio(snapshot) : ""}
    ${selected === "news" ? tradingNews(snapshot) : ""}
    ${selected === "activity" ? tradingActivity(snapshot) : ""}
    <div class="trade-disclaimer">Research workspace only. Demo data is synthetic and delayed; outputs are not financial advice or an offer to trade. Connect an approved market-data provider and broker compliance controls before live use.</div>
  </div>`;
}

function tradeKpi(value, label, delta) { return `<div class="trade-kpi"><span class="value">${e(value)}</span><span class="label">${e(label)}</span><span class="delta">${e(delta)}</span></div>`; }
function money(value, market) { return `${market === "ASX" ? "A$" : "$"}${Number(value).toFixed(2)}`; }
function pct(value) { return `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`; }
function e(value) { return h(String(value ?? "")); }
function signalState(signal) { return `<span class="signal-state ${signal.status}">${signal.status}</span>`; }
function tags(signal) { return `<div class="trade-tags">${signal.tags.map((tag) => `<span class="trade-tag">${e(tag)}</span>`).join("")}</div>`; }

function tradingWatchlist(snapshot) {
  return `<div class="trade-panel"><div class="trade-panel-head"><h3>Opportunity Watchlist</h3><span class="meta">Updated ${new Date(snapshot.generatedAt).toLocaleString()}</span></div><div class="trade-table-wrap"><table class="trade-table">
    <thead><tr><th>Rank</th><th>Symbol</th><th>Price</th><th>Gap</th><th>Rel volume</th><th>Setup</th><th>Strategy</th><th>Score</th><th>Risk</th><th>Status</th></tr></thead>
    <tbody>${snapshot.signals.map((signal) => `<tr>
      <td class="meta">#${signal.rank}</td><td><span class="ticker">${e(signal.symbol)}</span><span class="market-label">${e(signal.market)}</span></td>
      <td>${money(signal.price, signal.market)}</td><td class="${signal.gapPercent >= 0 ? "up" : "down"}">${pct(signal.gapPercent)}</td><td>${signal.relativeVolume.toFixed(1)}x</td>
      <td>${tags(signal)}</td><td>${e(signal.strategy.strategy)}</td><td><div class="score-ring" style="--score:${signal.confidence}"><span>${signal.confidence}</span></div></td>
      <td>${signal.risk.accepted ? `<span class="up">${signal.risk.riskRewardRatio.toFixed(1)} RR</span>` : '<span class="down">Rejected</span>'}</td><td>${signalState(signal)}</td>
    </tr>`).join("")}</tbody></table></div></div>`;
}

function tradingSignals(snapshot) {
  const signals = snapshot.signals.filter((signal) => signal.status !== "rejected");
  return `<div class="signal-grid">${signals.map((signal) => `<article class="signal-card" onclick="showSignal('${e(signal.symbol)}')">
    <div class="signal-card-top"><div><span class="meta">#${signal.rank} ${e(signal.market)}</span><h3>${e(signal.symbol)}</h3></div><div style="text-align:right"><div class="signal-price">${money(signal.price, signal.market)}</div>${signalState(signal)}</div></div>
    <div class="signal-strategy">${e(signal.strategy.strategy)}</div>${tags(signal)}
    <div class="levels"><div><span>ENTRY</span><b>${money(signal.risk.entry, signal.market)}</b></div><div><span>STOP</span><b class="down">${money(signal.risk.stopLoss, signal.market)}</b></div><div><span>TARGET</span><b class="up">${money(signal.risk.takeProfit, signal.market)}</b></div></div>
    <p class="meta">${e(signal.catalyst.summary)}</p><div class="row"><b>${signal.confidence}% confidence</b><span class="spacer"></span><span class="up">${signal.risk.riskRewardRatio.toFixed(1)} RR</span></div>
  </article>`).join("")}</div><div id="signalDetail"></div>`;
}

window.showSignal = (symbol) => {
  const signal = state.trading.signals.find((item) => item.symbol === symbol);
  if (!signal) return;
  const box = $("#signalDetail");
  box.innerHTML = `<div class="trade-panel" style="margin-top:14px"><div class="trade-panel-head"><h3>Dashboard Notification Preview</h3><button class="btn ghost" onclick="$('#signalDetail').innerHTML=''">Close</button></div><div class="trade-panel-body notification-preview">NEW SIGNAL\n\nTicker: ${e(signal.symbol)}\nStrategy: ${e(signal.strategy.strategy)}\nEntry: ${money(signal.risk.entry, signal.market)}\nStop: ${money(signal.risk.stopLoss, signal.market)}\nTarget: ${money(signal.risk.takeProfit, signal.market)}\nRisk Reward: ${signal.risk.riskRewardRatio.toFixed(1)}\nCatalyst: ${e(signal.catalyst.summary)}\nConfidence: ${signal.confidence}%</div></div>`;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

function tradingBacktests(snapshot) {
  return `<div class="trade-panel"><div class="trade-panel-head"><h3>Historical Strategy Ranking</h3><span class="meta">30D / 90D / 1Y walk-forward windows</span></div><div class="trade-table-wrap"><table class="trade-table"><thead><tr><th>Rank</th><th>Symbol</th><th>Strategy</th><th>Window</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Sharpe</th><th>Max drawdown</th></tr></thead><tbody>
  ${snapshot.signals.flatMap((signal) => signal.backtests.map((metric, index) => `<tr><td>${index === 0 ? `#${signal.rank}` : ""}</td><td class="ticker">${index === 0 ? e(signal.symbol) : ""}</td><td>${index === 0 ? e(signal.strategy.strategy) : ""}</td><td>${metric.period}</td><td>${metric.trades}</td><td class="${metric.winRate >= 55 ? "up" : ""}">${metric.winRate.toFixed(1)}%</td><td>${metric.profitFactor.toFixed(2)}</td><td>${metric.sharpeRatio.toFixed(2)}</td><td class="${metric.maxDrawdown > 15 ? "down" : ""}">${metric.maxDrawdown.toFixed(1)}%</td></tr>`)).join("")}
  </tbody></table></div></div>`;
}

function tradingPortfolio(snapshot) {
  const selected = state.tradingProfile || "balanced";
  const portfolio = snapshot.portfolios.find((item) => item.profile === selected);
  const colors = ["#62dca0","#72d9ff","#ffbe76","#c79bff","#ff7a90","#70a5ff","#9fdb72","#d49aff","#80c7c1","#f2dc78"];
  return `<div class="trade-panel"><div class="trade-panel-head"><h3>Portfolio Construction</h3><div class="portfolio-controls">${snapshot.portfolios.map((item) => `<button class="${item.profile === selected ? "active" : ""}" onclick="selectTradingProfile('${item.profile}')">${item.profile}</button>`).join("")}</div></div><div class="trade-panel-body">
    <div class="row"><div><span class="meta">MAX POSITIONS</span><b style="display:block;font-size:20px">${portfolio.maxPositions}</b></div><div><span class="meta">CASH RESERVE</span><b style="display:block;font-size:20px">${portfolio.cashReservePercent}%</b></div></div>
    <div class="allocation">${portfolio.positions.map((position,index) => `<span title="${e(position.symbol)} ${position.weightPercent}%" style="width:${position.weightPercent}%;background:${colors[index]}"></span>`).join("")}<span style="width:${portfolio.cashReservePercent}%;background:#303947"></span></div>
    <div class="portfolio-list">${portfolio.positions.map((position,index) => `<div class="portfolio-position"><div><span class="ticker">${e(position.symbol)}</span><div class="meta">${e(position.strategy)}</div></div><div style="text-align:right"><b style="color:${colors[index]}">${position.weightPercent.toFixed(1)}%</b><div class="meta">score ${position.score}</div></div></div>`).join("")}</div>
  </div></div>`;
}
window.selectTradingProfile = (profile) => { state.tradingProfile = profile; render(); };

function tradingNews(snapshot) {
  return `<div class="news-grid">${snapshot.signals.slice().sort((a,b) => b.catalyst.catalystScore-a.catalyst.catalystScore).map((signal) => `<article class="news-card"><div class="row"><span class="ticker">${e(signal.symbol)}</span><span class="pill">${e(signal.catalyst.category)}</span><span class="spacer"></span><b>${signal.catalyst.catalystScore}/100</b></div><p>${e(signal.catalyst.summary)}</p><div class="news-meta"><span class="sentiment-${signal.catalyst.sentiment}">${e(signal.catalyst.sentiment)}</span><span>${Math.round(signal.catalyst.confidence*100)}% source confidence</span></div></article>`).join("")}</div>`;
}

function tradingActivity(snapshot) {
  const shortNames = ["SCAN","NEWS","TA","STR","BT","RISK","PORT","SEND"];
  return `<div class="trade-panel"><div class="trade-panel-head"><h3>Event-driven Agent Workflow</h3><span class="meta">${snapshot.activity.length} stages complete</span></div><div class="trade-panel-body"><div style="overflow:auto;padding:8px 0 20px"><div class="agent-map"><span class="trade-pulse"></span>${snapshot.activity.map((item,index) => `<div class="trade-agent complete"><span class="trade-agent-icon">${shortNames[index]}</span><span class="trade-agent-name">${e(item.agent.replace(" Agent", ""))}</span><span class="trade-agent-time">${item.durationMs}ms</span></div>`).join("")}</div></div>
    <div class="activity-list">${snapshot.activity.slice().reverse().map((item,index) => `<div class="activity-row"><span class="activity-icon">${shortNames[7-index]}</span><b>${e(item.agent)}</b><p>${e(item.message)}</p><span class="meta">${item.durationMs} ms</span></div>`).join("")}</div>
  </div></div>`;
}
