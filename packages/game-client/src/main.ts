/**
 * main.ts — Debug Panel entry point.
 *
 * Connects ScenarioRunner → DebugProjection → DOM panels.
 * game-client ONLY reads DebugProjection. It never mutates world state.
 */

import "./styles.css";
import {
  ScenarioRunner, defaultSurvivalDecision,
} from "@project-god/core-sim";
import {
  GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG,
} from "../../core-sim/src/scenarios/golden-scenario-001";
import type {
  DebugProjection, DebugAgentView, SimEvent,
} from "@project-god/shared";

// ── State ──────────────────────────────────────────────────

let runner: ScenarioRunner;
let autoRunTimer: ReturnType<typeof setInterval> | null = null;
let selectedAgentId: string | null = null;
let eventFilter: string | null = null;
let mapCells: HTMLDivElement[][] = [];
const MAP_W = GOLDEN_WORLD_CONFIG.width;
const MAP_H = GOLDEN_WORLD_CONFIG.height;

// ── Init ───────────────────────────────────────────────────

function init() {
  runner = new ScenarioRunner({
    id: "golden-scenario-001",
    worldConfig: GOLDEN_WORLD_CONFIG,
    tickContext: GOLDEN_TICK_CONTEXT,
    decideFn: defaultSurvivalDecision(GOLDEN_NEEDS_CONFIG),
  });

  buildMapGrid();
  buildEventFilters();
  bindControls();
  render();
}

// ── Map Grid Construction ──────────────────────────────────

function buildMapGrid() {
  const grid = document.getElementById("map-grid")!;
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${MAP_W}, 22px)`;
  mapCells = [];

  for (let y = 0; y < MAP_H; y++) {
    const row: HTMLDivElement[] = [];
    for (let x = 0; x < MAP_W; x++) {
      const cell = document.createElement("div");
      cell.className = "map-cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      grid.appendChild(cell);
      row.push(cell);
    }
    mapCells.push(row);
  }
}

// ── Event Filters ──────────────────────────────────────────

const EVENT_TYPES = [
  "ENTITY_MOVED", "RESOURCE_GATHERED", "FOOD_EATEN", "WATER_DRUNK",
  "ACTION_REJECTED", "ENTITY_DIED", "NEED_DECAYED",
];

function buildEventFilters() {
  const container = document.getElementById("event-filters")!;
  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = "event-filter active";
  allBtn.textContent = "All";
  allBtn.onclick = () => { eventFilter = null; updateFilterButtons(); render(); };
  container.appendChild(allBtn);

  for (const type of EVENT_TYPES) {
    const btn = document.createElement("button");
    btn.className = "event-filter";
    btn.textContent = type.replace(/_/g, " ").toLowerCase();
    btn.dataset.type = type;
    btn.onclick = () => { eventFilter = type; updateFilterButtons(); render(); };
    container.appendChild(btn);
  }
}

function updateFilterButtons() {
  const buttons = document.querySelectorAll(".event-filter");
  buttons.forEach((btn) => {
    const el = btn as HTMLElement;
    if (eventFilter === null) {
      el.classList.toggle("active", !el.dataset.type);
    } else {
      el.classList.toggle("active", el.dataset.type === eventFilter);
    }
  });
}

// ── Controls ───────────────────────────────────────────────

function bindControls() {
  document.getElementById("btn-step")!.onclick = () => { runner.step(); render(); };
  document.getElementById("btn-run")!.onclick = startAutoRun;
  document.getElementById("btn-pause")!.onclick = stopAutoRun;
  document.getElementById("btn-reset")!.onclick = () => {
    stopAutoRun();
    runner.reset();
    selectedAgentId = null;
    render();
  };
}

function getSpeed(): number {
  const slider = document.getElementById("speed-slider") as HTMLInputElement;
  return parseInt(slider.value, 10);
}

function startAutoRun() {
  if (autoRunTimer) return;
  document.getElementById("btn-run")!.setAttribute("disabled", "");
  document.getElementById("btn-pause")!.removeAttribute("disabled");
  setStatus("running");

  autoRunTimer = setInterval(() => {
    const proj = runner.getProjection();
    if (proj.counters.aliveAgents === 0) {
      stopAutoRun();
      return;
    }
    runner.step();
    render();
  }, Math.max(20, 500 / getSpeed()));
}

function stopAutoRun() {
  if (autoRunTimer) clearInterval(autoRunTimer);
  autoRunTimer = null;
  document.getElementById("btn-run")!.removeAttribute("disabled");
  document.getElementById("btn-pause")!.setAttribute("disabled", "");
  setStatus("paused");
}

function setStatus(state: "ready" | "running" | "paused") {
  const el = document.getElementById("status-display")!;
  el.textContent = state.toUpperCase();
  el.className = `status-badge ${state}`;
}

// ── Render ──────────────────────────────────────────────────

function render() {
  const proj = runner.getProjection();
  renderTopBar(proj);
  renderAgentList(proj);
  renderMap(proj);
  renderEventLog(proj);
  renderBottomBar(proj);
}

function renderTopBar(proj: DebugProjection) {
  document.getElementById("tick-display")!.textContent = `Tick: ${proj.tick}`;
  document.getElementById("seed-display")!.textContent = `Seed: ${proj.seed}`;
  if (!autoRunTimer && proj.tick > 0) setStatus("paused");
  if (proj.tick === 0) setStatus("ready");
}

function renderAgentList(proj: DebugProjection) {
  const container = document.getElementById("agent-list")!;
  container.innerHTML = "";

  for (const agent of proj.agents) {
    const card = document.createElement("div");
    card.className = `agent-card${agent.alive ? "" : " dead"}${agent.id === selectedAgentId ? " selected" : ""}`;
    card.onclick = () => { selectedAgentId = agent.id; render(); };

    const dot = agent.alive ? `<span class="agent-status alive"></span>` : `<span class="agent-status dead-dot"></span>`;
    const inv = Object.entries(agent.inventory).map(([k, v]) => `${k}: ${v}`).join(", ") || "empty";

    card.innerHTML = `
      <div class="agent-name">${dot}${agent.id}</div>
      <div class="need-bar-container">
        <div class="need-bar-label"><span>Hunger</span><span>${Math.round(agent.needs.hunger ?? 0)}</span></div>
        <div class="need-bar"><div class="need-bar-fill hunger${(agent.needs.hunger ?? 0) <= 25 ? " critical" : ""}" style="width:${agent.needs.hunger ?? 0}%"></div></div>
      </div>
      <div class="need-bar-container">
        <div class="need-bar-label"><span>Thirst</span><span>${Math.round(agent.needs.thirst ?? 0)}</span></div>
        <div class="need-bar"><div class="need-bar-fill thirst${(agent.needs.thirst ?? 0) <= 25 ? " critical" : ""}" style="width:${agent.needs.thirst ?? 0}%"></div></div>
      </div>
      <div style="font-size:10px;color:var(--text-2);margin-top:3px">📦 ${inv}</div>
    `;
    container.appendChild(card);
  }
}

function renderMap(proj: DebugProjection) {
  // Reset all cells
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const cell = mapCells[y][x];
      cell.className = "map-cell";
      cell.innerHTML = "";
    }
  }

  // Mark resources
  for (const res of proj.resources) {
    if (res.position.x < MAP_W && res.position.y < MAP_H) {
      const cell = mapCells[res.position.y][res.position.x];
      cell.classList.add(res.resourceType === "berry" ? "has-berry" : "has-water");
      const icon = res.resourceType === "berry" ? "🫐" : "💧";
      cell.innerHTML = `<span class="cell-icon">${icon}</span>`;
    }
  }

  // Mark agents (override resources)
  for (const agent of proj.agents) {
    if (agent.position.x < MAP_W && agent.position.y < MAP_H) {
      const cell = mapCells[agent.position.y][agent.position.x];
      cell.classList.add(agent.alive ? "has-agent" : "has-agent-dead");
      if (agent.id === selectedAgentId) cell.classList.add("selected-agent");
      const icon = agent.alive ? "🧑" : "💀";
      cell.innerHTML = `<span class="cell-icon">${icon}</span>`;
    }
  }
}

function renderEventLog(proj: DebugProjection) {
  const container = document.getElementById("event-log")!;
  container.innerHTML = "";

  let events = proj.recentEvents;
  if (eventFilter) {
    events = events.filter((e) => e.type === eventFilter);
  }

  // Show most recent first
  const display = events.slice(-40).reverse();
  for (const ev of display) {
    const entry = document.createElement("div");
    entry.className = `event-entry ${ev.type}`;
    const detail = formatEvent(ev);
    entry.innerHTML = `<span class="event-tick">[${ev.tick}]</span><span class="event-type">${ev.type}</span> ${detail}`;
    container.appendChild(entry);
  }
}

function formatEvent(ev: SimEvent): string {
  const e = ev as any;
  switch (ev.type) {
    case "ENTITY_MOVED": return `${e.entityId} → (${e.to?.x},${e.to?.y})`;
    case "RESOURCE_GATHERED": return `${e.entityId} +${e.quantity} ${e.resourceType}`;
    case "FOOD_EATEN": return `${e.entityId} +${e.hungerRestored} hunger`;
    case "WATER_DRUNK": return `${e.entityId} +${e.thirstRestored} thirst`;
    case "ACTION_REJECTED": return `${e.entityId} ✗ ${e.reason}`;
    case "ENTITY_DIED": return `${e.entityId} ☠ ${e.cause}`;
    case "NEED_DECAYED": return `${e.entityId} ${e.need} ${e.oldValue}→${e.newValue}`;
    default: return "";
  }
}

function renderBottomBar(proj: DebugProjection) {
  // Metrics
  document.getElementById("metric-alive")!.textContent = `Alive: ${proj.counters.aliveAgents}`;
  document.getElementById("metric-dead")!.textContent = `Dead: ${proj.counters.deadAgents}`;
  document.getElementById("metric-rejected")!.textContent = `Rejected: ${proj.counters.rejectedActions}`;
  document.getElementById("metric-gathers")!.textContent = `Gathers: ${proj.counters.gatherCount}`;
  document.getElementById("metric-eats")!.textContent = `Eats: ${proj.counters.eatCount}`;
  document.getElementById("metric-drinks")!.textContent = `Drinks: ${proj.counters.drinkCount}`;

  // Selected agent detail
  const detailEl = document.getElementById("agent-detail")!;
  if (selectedAgentId) {
    const agent = proj.agents.find((a) => a.id === selectedAgentId);
    if (agent) {
      const inv = Object.entries(agent.inventory).map(([k, v]) => `${k}:${v}`).join(" ") || "empty";
      const action = agent.lastAction
        ? `${agent.lastAction.type}${agent.lastAction.reason ? ` (${agent.lastAction.reason})` : ""} → ${agent.lastActionResult}`
        : "—";
      detailEl.innerHTML = `
        <strong>${agent.id}</strong>
        &nbsp;|&nbsp; Pos: (${agent.position.x},${agent.position.y})
        &nbsp;|&nbsp; H:${Math.round(agent.needs.hunger ?? 0)} T:${Math.round(agent.needs.thirst ?? 0)}
        &nbsp;|&nbsp; 📦 ${inv}
        &nbsp;|&nbsp; Last: ${action}
        &nbsp;|&nbsp; ${agent.alive ? "🟢 alive" : "🔴 dead"}
      `;
    }
  } else {
    detailEl.innerHTML = `<span class="detail-label">Click an agent to view details</span>`;
  }
}

// ── Boot ───────────────────────────────────────────────────
init();
