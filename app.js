const STATUSES = {
  pending: "Pending local machine pickup",
  processing: "Running on Local PC",
  completed: "Completed",
  error: "Error"
};

const STRATEGY_COLORS = ["#38d49b", "#a77dff", "#27f4f2", "#ff6b6b", "#ffd166"];
const config = window.APP_CONFIG || {};
const isConfigured = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
const supabaseClient =
  isConfigured && window.supabase
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    : null;

const state = {
  analyses: [],
  bundleName: "",
  walletInputs: ["", "", ""]
};

const app = document.querySelector("#app");
const storageMode = document.querySelector("#storageMode");
const refreshButton = document.querySelector("#refreshButton");

storageMode.textContent = isConfigured ? "Supabase connecté" : "Mode démo local";
refreshButton.addEventListener("click", loadAnalyses);
window.addEventListener("hashchange", renderRoute);

loadAnalyses();
setInterval(loadAnalyses, 10000);

async function loadAnalyses() {
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("analyses")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      state.analyses = data || [];
    } else {
      state.analyses = getDemoAnalyses();
    }
    if (!isCreateRoute()) {
      renderRoute();
    }
  } catch (error) {
    app.innerHTML = `<section class="panel empty-state">Erreur de chargement : ${escapeHtml(error.message)}</section>`;
  }
}

function renderRoute() {
  const hash = window.location.hash || "#/";

  if (hash.startsWith("#/create")) {
    renderCreate();
    return;
  }

  if (hash.startsWith("#/results/")) {
    renderResults(hash.replace("#/results/", ""));
    return;
  }

  renderOverview();
}

function renderOverview() {
  app.replaceChildren(template("overviewTemplate"));

  const rows = document.querySelector("#bundleRows");
  const bundleCount = document.querySelector("#bundleCount");
  const queueCount = document.querySelector("#queueCount");
  const runningCount = document.querySelector("#runningCount");
  const completedCount = document.querySelector("#completedCount");

  bundleCount.textContent = String(state.analyses.length);
  queueCount.textContent = String(countStatus("pending"));
  runningCount.textContent = String(countStatus("processing"));
  completedCount.textContent = String(countStatus("completed"));

  if (state.analyses.length === 0) {
    rows.innerHTML = `<tr><td colspan="6" class="empty-state">Aucun bundle pour le moment.</td></tr>`;
    return;
  }

  rows.innerHTML = state.analyses
    .map((analysis, index) => {
      const hasResults = analysis.status === "completed" && analysis.result;
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(analysis.name)}</td>
          <td>${formatDate(analysis.created_at)}</td>
          <td>${analysis.wallets?.length || 0}</td>
          <td><span class="status-dot status-${analysis.status}">${STATUSES[analysis.status] || analysis.status}</span></td>
          <td>
            ${
              hasResults
                ? `<a class="status-button" href="#/results/${analysis.id}">View Results</a>`
                : `<span class="status-button" aria-disabled="true">Waiting</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCreate() {
  app.replaceChildren(template("createTemplate"));
  const rows = document.querySelector("#walletRows");
  const addButton = document.querySelector("#addWalletButton");
  const form = document.querySelector("#bundleForm");
  const nameInput = document.querySelector("#bundleName");

  nameInput.value = state.bundleName;
  nameInput.addEventListener("input", () => {
    state.bundleName = nameInput.value;
  });
  renderWalletInputs(rows);
  addButton.addEventListener("click", () => {
    if (state.walletInputs.length >= 20) return;
    state.walletInputs.push("");
    renderWalletInputs(rows);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitBundle();
  });
}

function renderWalletInputs(container) {
  container.innerHTML = state.walletInputs
    .map(
      (value, index) => `
        <div class="wallet-row">
          <input
            data-wallet-index="${index}"
            type="text"
            value="${escapeAttribute(value)}"
            placeholder="Adresse wallet Solana ${index + 1}"
            aria-label="Adresse wallet Solana ${index + 1}"
          />
          <button class="delete-button" data-delete-wallet="${index}" type="button" title="Supprimer la ligne">
            <img src="assets/icon-trash.svg" alt="" />
          </button>
        </div>
      `
    )
    .join("");

  container.querySelectorAll("[data-wallet-index]").forEach((input) => {
    input.addEventListener("input", () => {
      state.walletInputs[Number(input.dataset.walletIndex)] = input.value;
    });
  });

  container.querySelectorAll("[data-delete-wallet]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.deleteWallet);
      state.walletInputs.splice(index, 1);
      if (state.walletInputs.length === 0) state.walletInputs.push("");
      renderWalletInputs(container);
    });
  });
}

async function submitBundle() {
  const name = state.bundleName.trim();
  const wallets = state.walletInputs.map((wallet) => wallet.trim()).filter(Boolean);
  const message = document.querySelector("#formMessage");

  if (!name || wallets.length === 0) {
    message.textContent = "Ajoute un nom et au moins un wallet.";
    return;
  }

  const analysis = {
    name,
    wallets,
    status: "pending"
  };

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from("analyses").insert(analysis);
      if (error) throw error;
    } else {
      saveDemoAnalysis({
        id: createId(),
        ...analysis,
        created_at: new Date().toISOString(),
        result: null
      });
    }

    state.bundleName = "";
    state.walletInputs = ["", "", ""];
    window.location.hash = "#/";
    await loadAnalyses();
  } catch (error) {
    message.textContent = error.message || "Impossible d’enregistrer le bundle.";
  }
}

function renderResults(id) {
  const analysis = state.analyses.find((item) => item.id === id);

  if (!analysis) {
    app.innerHTML = `<section class="panel empty-state">Bundle introuvable.</section>`;
    return;
  }

  if (analysis.status !== "completed" || !analysis.result) {
    app.innerHTML = `<section class="panel empty-state">Les résultats ne sont pas encore prêts.</section>`;
    return;
  }

  app.replaceChildren(template("resultsTemplate"));
  const result = analysis.result;
  const strategies = result.strategies || [];
  const curves = normalizeCurves(result, strategies);
  const best = findBestStrategy(strategies, result.summary?.best_strategy);

  document.querySelector("#resultBreadcrumb").textContent = `Overview › ${analysis.name} › Results`;
  document.querySelector("#resultTitle").textContent = `Analysis Results: ${analysis.name}`;
  document.querySelector("#resultSubtitle").textContent = `${analysis.wallets.length} wallets simulés`;
  document.querySelector("#balanceChart").innerHTML = renderBalanceChart(curves);
  document.querySelector("#bestStrategy").innerHTML = renderBestStrategy(best);
  document.querySelector("#strategyRows").innerHTML =
    strategies.map(renderStrategyRow).join("") ||
    `<tr><td colspan="7" class="empty-state">Aucune stratégie retournée.</td></tr>`;
}

function renderStrategyRow(strategy) {
  const pnl = Number(strategy.pnl_percent || 0);
  return `
    <tr>
      <td>${escapeHtml(strategy.name || strategy.id || "-")}</td>
      <td class="${pnl >= 0 ? "positive" : "negative"}">${percent(pnl)}</td>
      <td>${number(strategy.trades)}</td>
      <td>${percent(strategy.win_rate)}</td>
      <td>${percent(strategy.roi_percent ?? strategy.average_roi ?? strategy.pnl_percent)}</td>
      <td>${percent(strategy.average_trade_percent)}</td>
      <td>${percent(strategy.max_drawdown)}</td>
    </tr>
  `;
}

function renderBestStrategy(strategy) {
  if (!strategy) {
    return `<span class="label">Meilleure stratégie</span><strong>-</strong>`;
  }

  return `
    <span class="label">🏆 Meilleure stratégie</span>
    <span>Best Strategy:</span>
    <strong>${escapeHtml(strategy.name)}</strong>
    <span class="pnl">Total PnL: ${percent(strategy.pnl_percent)}</span>
    <span>Win Rate: ${percent(strategy.win_rate)}</span>
  `;
}

function renderBalanceChart(curves) {
  if (!curves.length) return `<div class="empty-state">Pas de courbes disponibles.</div>`;

  const width = 900;
  const height = 360;
  const pad = { top: 20, right: 190, bottom: 42, left: 112 };
  const points = curves.flatMap((curve) => curve.points.map((point) => Number(point.value)));
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const maxLength = Math.max(...curves.map((curve) => curve.points.length));
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  const xFor = (index) => pad.left + (index / Math.max(maxLength - 1, 1)) * chartWidth;
  const yFor = (value) => pad.top + chartHeight - ((Number(value) - min) / range) * chartHeight;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = pad.top + ratio * chartHeight;
      const value = max - ratio * range;
      return `
        <line class="chart-grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />
        <text class="chart-tick" x="54" y="${y + 4}">${Math.round(value)}</text>
      `;
    })
    .join("");

  const paths = curves
    .map((curve, curveIndex) => {
      const color = curve.color || STRATEGY_COLORS[curveIndex % STRATEGY_COLORS.length];
      const path = curve.points
        .map((point, pointIndex) => {
          const command = pointIndex === 0 ? "M" : "L";
          return `${command} ${xFor(pointIndex).toFixed(1)} ${yFor(point.value).toFixed(1)}`;
        })
        .join(" ");
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
    })
    .join("");

  const legend = curves
    .map((curve, index) => {
      const y = pad.top + 18 + index * 24;
      const color = curve.color || STRATEGY_COLORS[index % STRATEGY_COLORS.length];
      return `
        <line x1="${width - pad.right + 28}" y1="${y - 4}" x2="${width - pad.right + 52}" y2="${y - 4}" stroke="${color}" stroke-width="4" stroke-linecap="round" />
        <text class="chart-legend" x="${width - pad.right + 62}" y="${y}">${escapeHtml(curve.strategy)}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Courbes de balance par stratégie">
      ${grid}
      <text class="chart-axis-label" x="${width / 2 - 18}" y="${height - 8}">Days</text>
      <text class="chart-axis-label" transform="translate(22 ${height / 2 + 28}) rotate(-90)">Balance</text>
      ${paths}
      ${legend}
    </svg>
  `;
}

function normalizeCurves(result, strategies) {
  if (result.charts?.balance_curves?.length) return result.charts.balance_curves;

  if (result.charts?.equity_curve?.length) {
    return [
      {
        strategy: strategies[0]?.name || "Strategy",
        color: STRATEGY_COLORS[0],
        points: result.charts.equity_curve
      }
    ];
  }

  return [];
}

function findBestStrategy(strategies, bestName) {
  if (!strategies.length) return null;
  return (
    strategies.find((strategy) => strategy.name === bestName || strategy.id === bestName) ||
    [...strategies].sort((a, b) => Number(b.pnl_percent || 0) - Number(a.pnl_percent || 0))[0]
  );
}

function countStatus(status) {
  return state.analyses.filter((analysis) => analysis.status === status).length;
}

function isCreateRoute() {
  return (window.location.hash || "#/").startsWith("#/create");
}

function getDemoAnalyses() {
  const stored = JSON.parse(localStorage.getItem("copyTradingAnalyses") || "[]");
  if (stored.length) return stored;

  const demo = [
    {
      id: "demo-completed",
      name: "Whale Alpha List 1",
      wallets: ["7Y8x2a", "H3k9z1", "Fp2L5q"],
      status: "completed",
      created_at: "2026-05-07T12:00:00.000Z",
      result: createDemoResult()
    },
    {
      id: "demo-processing",
      name: "Beta Degens 2",
      wallets: ["BETA1", "BETA2"],
      status: "processing",
      created_at: "2026-05-07T10:30:00.000Z",
      result: null
    },
    {
      id: "demo-pending",
      name: "Test Bundle X",
      wallets: ["TEST1"],
      status: "pending",
      created_at: "2026-05-06T18:15:00.000Z",
      result: null
    }
  ];
  localStorage.setItem("copyTradingAnalyses", JSON.stringify(demo));
  return demo;
}

function createDemoResult() {
  return {
    summary: {
      total_pnl_percent: 31.6,
      total_trades: 465,
      win_rate: 68.4,
      average_roi: 18.1,
      best_strategy: "Conservative Growth",
      worst_strategy: "Martingale",
      max_drawdown: 21.4
    },
    strategies: [
      strategy("aggressive", "Aggressive Copy", 18.43, 223, 56, 16, 8.2),
      strategy("conservative", "Conservative Growth", 24.91, 127, 85, 23.26, 4.5),
      strategy("degen", "Degen Play", 17.81, 96, 70, 22.98, 14.9),
      strategy("martingale", "Martingale", -9.55, 19, 56, -10, 31.2)
    ],
    charts: {
      balance_curves: [
        curve("Aggressive Copy", "#38d49b", [1000, 1300, 1900, 2050, 2600, 2350, 2100, 2450, 2950, 3600]),
        curve("Conservative Growth", "#a77dff", [1000, 1120, 1350, 1600, 1850, 2050, 2320, 2750, 3150, 3420]),
        curve("Degen Play", "#27f4f2", [1000, 1080, 1500, 1900, 2050, 2150, 2220, 2160, 2400, 2850]),
        curve("Martingale", "#ff6b6b", [1000, 860, 780, 1150, 980, 810, 430, 650, 280, 45])
      ]
    },
    logs: ["Simulation démo prête", "4 stratégies comparées"]
  };
}

function strategy(id, name, pnl, trades, winRate, roi, drawdown) {
  return {
    id,
    name,
    pnl_percent: pnl,
    trades,
    wins: Math.round((trades * winRate) / 100),
    losses: trades - Math.round((trades * winRate) / 100),
    win_rate: winRate,
    roi_percent: roi,
    average_trade_percent: pnl / trades,
    max_drawdown: drawdown
  };
}

function curve(strategyName, color, values) {
  return {
    strategy: strategyName,
    color,
    points: values.map((value, index) => ({
      timestamp: `2026-01-${String(index * 3 + 1).padStart(2, "0")}`,
      value
    }))
  };
}

function saveDemoAnalysis(analysis) {
  const current = getDemoAnalyses();
  localStorage.setItem("copyTradingAnalyses", JSON.stringify([analysis, ...current]));
}

function template(id) {
  return document.querySelector(`#${id}`).content.cloneNode(true);
}

function createId() {
  return window.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function percent(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(2)} %`;
}

function number(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("fr-FR").format(value);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
