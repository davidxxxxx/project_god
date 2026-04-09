/**
 * main.ts — Debug Panel entry point.
 *
 * Connects ScenarioRunner → TimeController → DebugProjection → DOM + PixiJS panels.
 * game-client ONLY reads DebugProjection. It never mutates world state.
 *
 * Divine Time: TimeController drives the game loop via requestAnimationFrame.
 * Speed presets, auto-pause, and fast-forward replace the old setInterval.
 */

import "./styles.css";
import {
  ScenarioRunner, defaultMemoryDecision, defaultPostTickMemoryHook,
} from "@project-god/core-sim";
import type { MiracleRequest, MiracleType } from "@project-god/core-sim";
import { parseDivineIntent, applyDoctrineShift } from "@project-god/core-sim";
import {
  GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG,
} from "../../core-sim/src/scenarios/golden-scenario-001";
import type {
  DebugProjection, DebugAgentView, DebugStructureView, DebugTribeView, SimEvent, Vec2,
} from "@project-god/shared";
import { tickToGameDate } from "@project-god/shared";
import type { TimeSpeed, FastForwardTarget } from "@project-god/shared";
import { PixiWorldRenderer } from "./renderer/PixiWorldRenderer";
import { TimeController } from "./TimeController";
import { AutoTimePolicy } from "./AutoTimePolicy";
import { NarrativeEngine, DEFAULT_LLM_CONFIG } from "@project-god/narrative-runtime";
import type { NarrativeEntry } from "@project-god/narrative-runtime";

// ── State ───────────────────────────────────────────────

let runner: ScenarioRunner;
let timeCtrl: TimeController;
let narrativeEngine: NarrativeEngine;
let selectedAgentId: string | null = null;
let eventFilter: string | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const MAP_W = GOLDEN_WORLD_CONFIG.width;
const MAP_H = GOLDEN_WORLD_CONFIG.height;
let worldRenderer: PixiWorldRenderer;

// ── Init ───────────────────────────────────────────────────

async function init() {
  runner = new ScenarioRunner({
    id: "golden-scenario-001",
    worldConfig: GOLDEN_WORLD_CONFIG,
    tickContext: GOLDEN_TICK_CONTEXT,
    decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
    postTickHook: defaultPostTickMemoryHook(),
  });

  // Initialize PixiJS world renderer
  worldRenderer = new PixiWorldRenderer();
  const pixiContainer = document.getElementById("pixi-container")!;
  await worldRenderer.init(pixiContainer, MAP_W, MAP_H);
  worldRenderer.onAgentClick = (agentId: string) => {
    selectedAgentId = agentId;
    render();
  };

  // Initialize TimeController
  const policy = new AutoTimePolicy();
  timeCtrl = new TimeController(runner, policy, render);
  timeCtrl.onAutoFocus = (entityId: string) => {
    selectedAgentId = entityId;
  };

  // Initialize NarrativeEngine (MVP-06A) with MiniMax LLM polish enabled
  narrativeEngine = new NarrativeEngine({
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    endpoint: "https://api.minimaxi.chat/v1",
    apiKey: import.meta.env.VITE_MINIMAX_API_KEY ?? "",
  });
  narrativeEngine.onPolished = () => {
    // If the game is paused (e.g. from an auto-pause on a critical event),
    // force a re-render so the UI updates with the new LLM text instantly.
    render();
  };

  buildEventFilters();
  bindControls();
  bindTabs();
  bindHistorian();
  bindOracleForm();
  render();
}

// (Map grid construction moved to PixiWorldRenderer)

// ── Event Filters ──────────────────────────────────────────

const EVENT_TYPES = [
  "ENTITY_MOVED", "RESOURCE_GATHERED", "FOOD_EATEN", "WATER_DRUNK",
  "ACTION_REJECTED", "ENTITY_DIED", "NEED_DECAYED",
  "STRUCTURE_BUILT", "STRUCTURE_EXPIRED", "WARMING_APPLIED",
  "SKILL_LEARNED", "SKILL_OBSERVED", "TECHNOLOGY_UNLOCKED",
  "TRIBE_GATHER_POINT_UPDATED", "SOCIAL_MEMORY_UPDATED",
  "ENVIRONMENT_CHANGED", "EXPOSURE_WARNING", "SHELTERED_APPLIED",
  "PRAYER_STARTED", "PRAYER_COMPLETED", "PRAYER_UNANSWERED",
  "MIRACLE_PERFORMED", "FAITH_CHANGED",
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

// ── Controls ─────────────────────────────────────────────

function bindControls() {
  // Step
  document.getElementById("btn-step")!.onclick = () => {
    timeCtrl.step();
  };

  // Play/Pause toggle
  document.getElementById("btn-play-pause")!.onclick = () => {
    timeCtrl.toggle();
  };

  // Reset
  document.getElementById("btn-reset")!.onclick = () => {
    timeCtrl.reset();
    runner.reset();
    selectedAgentId = null;
    render();
  };

  // ── Speed buttons ───────────────────────────────────────
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const speed = (btn as HTMLElement).dataset.speed as TimeSpeed;
      timeCtrl.setSpeed(speed);
      updateSpeedButtons();
    };
  });

  // ── Fast-forward buttons ────────────────────────────────
  document.querySelectorAll(".ff-btn").forEach((btn) => {
    (btn as HTMLElement).onclick = () => {
      const target = (btn as HTMLElement).dataset.target as FastForwardTarget;
      timeCtrl.fastForward(target);
    };
  });

  // ── Auto-pause toggle ──────────────────────────────────
  const autoPauseChk = document.getElementById("chk-auto-pause") as HTMLInputElement;
  autoPauseChk.onchange = () => {
    timeCtrl.setAutoEnabled(autoPauseChk.checked);
  };
}

function doMiracle(request: MiracleRequest) {
  const result = runner.performMiracle(request);
  if (!result.success) {
    console.warn("[divine] Miracle failed:", request.type, "- insufficient DP or no target");
  } else {
    // Show toast for miracle success if not handled by narrative-runtime
    const message = `Miracle ${request.type} performed.`;
    showSimpleToast(`✨ ${message}`);
  }
  render();
}

function updateSpeedButtons(): void {
  const currentSpeed = timeCtrl.getSpeed();
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    const el = btn as HTMLElement;
    el.classList.toggle("active", el.dataset.speed === currentSpeed);
  });
}

// ── Render ──────────────────────────────────────────────────

function render() {
  const proj = runner.getProjection();

  // Feed events to narrative engine (MVP-06A)
  const worldCtx = {
    timeOfDay: proj.environment?.timeOfDay,
    temperature: proj.environment?.temperature,
    tribeName: proj.tribes[0]?.name,
    tribePopulation: proj.counters.aliveAgents,
  };
  narrativeEngine.processEvents(proj.recentEvents, proj.tick, worldCtx);

  renderTopBar(proj);
  renderAgentList(proj);
  worldRenderer.update(proj, selectedAgentId);
  renderEventLog(proj);
  renderChronicle();
  renderNarrativeToast();
  renderBottomBar(proj);
}

function renderTopBar(proj: DebugProjection) {
  document.getElementById("tick-display")!.textContent = `Tick: ${proj.tick}`;
  document.getElementById("seed-display")!.textContent = `Seed: ${proj.seed}`;

  // Day/Year display
  const date = tickToGameDate(proj.tick);
  document.getElementById("time-display")!.textContent = `Day ${date.day} · Year ${date.year}`;

  // Play/Pause button state
  const playBtn = document.getElementById("btn-play-pause")!;
  const mode = timeCtrl.getMode();
  if (mode === "playing") {
    playBtn.textContent = "⏸ Pause";
  } else if (mode === "fastForward") {
    playBtn.textContent = "⏩ FF...";
  } else {
    playBtn.textContent = "▶ Play";
  }

  // Status badge
  const statusEl = document.getElementById("status-display")!;
  const statusMap = { paused: "PAUSED", playing: "RUNNING", fastForward: "FAST FORWARD" };
  const classMap = { paused: "paused", playing: "running", fastForward: "running" };
  statusEl.textContent = `${statusMap[mode]} ${timeCtrl.getSpeed()}`;
  statusEl.className = `status-badge ${classMap[mode]}`;

  // Speed button highlight
  updateSpeedButtons();

  // Interruption badge
  const intEl = document.getElementById("interruption-display")!;
  const interruption = timeCtrl.getLastInterruption();
  if (interruption) {
    const emoji: Record<string, string> = {
      PRAYER_STARTED: "🙏", ENTITY_BORN: "👶", ENTITY_DIED: "☠️",
      SKILL_LEARNED: "🧠", TECHNOLOGY_UNLOCKED: "🏛️", MIRACLE_PERFORMED: "✨",
      PAIR_BONDED: "💍",
    };
    const icon = emoji[interruption.reason] ?? "⚠️";
    intEl.textContent = `${icon} ${interruption.reason} → AUTO ${interruption.action.toUpperCase()}`;
  } else {
    intEl.textContent = "";
  }
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

    // Skill badges (MVP-02-D)
    const skillBadges = Object.entries(agent.skills)
      .map(([skillId, prof]) => {
        const icon = skillId === "fire_making" ? "🔥" : "⚡";
        return `<span class="skill-badge" title="${skillId} (${Math.round(prof * 100)}%)">${icon}</span>`;
      })
      .join("");

    // Social badge (MVP-02-E)
    const socialBadge = agent.socialMemoryCount > 0
      ? `<span class="social-badge" title="Knows ${agent.socialMemoryCount} entities">👥${agent.socialMemoryCount}</span>`
      : "";

    // Status badges (MVP-03-A)
    const statusBadges = (agent.statuses ?? []).map((s: string) => {
      if (s === "warming") return `<span class="status-badge warming" title="Near fire pit">🔥</span>`;
      if (s === "sheltered") return `<span class="status-badge sheltered" title="In shelter">🛖</span>`;
      return `<span class="status-badge" title="${s}">${s}</span>`;
    }).join("");

    // Semantic knowledge badge (MVP-03-B)
    const knowledgeBadge = agent.semanticMemoryCount > 0
      ? `<span class="knowledge-badge" title="${agent.semanticMemoryCount} semantic facts">🧠${agent.semanticMemoryCount}</span>`
      : "";

    // Lifecycle badge (MVP-04)
    const sexIcon = agent.sex === "male" ? "♂" : agent.sex === "female" ? "♀" : "";
    const ageLabel = `${agent.age ?? "?"}y`;
    const lifeBadge = `<span class="life-badge ${agent.lifeStage}" title="${agent.sex} age ${agent.age}">${sexIcon}${ageLabel}</span>`;
    const spouseBadge = agent.spouseId ? `<span class="spouse-badge" title="married to ${agent.spouseId}">💍</span>` : "";
    const prayerBadge = agent.isPraying ? `<span class="prayer-badge" title="praying">🙏</span>` : "";
    const faithBadge = agent.faith > 0 ? `<span class="life-badge" style="color:#fbbf24" title="faith: ${agent.faith}">✨${agent.faith}</span>` : "";
    const priestBadge = agent.role === "priest" ? `<span class="life-badge" style="color:#a78bfa" title="Priest">⛩️</span>` : "";

    card.innerHTML = `
      <div class="agent-name">${dot}${agent.id} ${lifeBadge}${spouseBadge}${prayerBadge}${faithBadge}${priestBadge}${skillBadges ? ` ${skillBadges}` : ""}${socialBadge ? ` ${socialBadge}` : ""}${knowledgeBadge ? ` ${knowledgeBadge}` : ""}${statusBadges ? ` ${statusBadges}` : ""}</div>
      <div class="need-bar-container">
        <div class="need-bar-label"><span>Hunger</span><span>${Math.round(agent.needs.hunger ?? 0)}</span></div>
        <div class="need-bar"><div class="need-bar-fill hunger${(agent.needs.hunger ?? 0) <= 25 ? " critical" : ""}" style="width:${agent.needs.hunger ?? 0}%"></div></div>
      </div>
      <div class="need-bar-container">
        <div class="need-bar-label"><span>Thirst</span><span>${Math.round(agent.needs.thirst ?? 0)}</span></div>
        <div class="need-bar"><div class="need-bar-fill thirst${(agent.needs.thirst ?? 0) <= 25 ? " critical" : ""}" style="width:${agent.needs.thirst ?? 0}%"></div></div>
      </div>
      <div class="need-bar-container">
        <div class="need-bar-label"><span>Exposure</span><span>${Math.round(agent.needs.exposure ?? 100)}</span></div>
        <div class="need-bar"><div class="need-bar-fill exposure${(agent.needs.exposure ?? 100) <= 30 ? " critical" : ""}" style="width:${agent.needs.exposure ?? 100}%"></div></div>
      </div>
      <div style="font-size:10px;color:var(--text-2);margin-top:3px">📦 ${inv}</div>
    `;
    container.appendChild(card);
  }
}

// renderMap replaced by PixiWorldRenderer.update() — see render() above.

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
    case "STRUCTURE_BUILT": return `🔥 ${e.entityId} built ${e.structureType} at (${e.position?.x},${e.position?.y})`;
    case "STRUCTURE_EXPIRED": return `⬛ ${e.structureType} at (${e.position?.x},${e.position?.y}) expired`;
    case "WARMING_APPLIED": return `🌡️ ${e.entityId} warmed by ${e.structureId}`;
    case "SKILL_LEARNED": return `🧠 ${e.entityId} learned ${e.skillId} (${e.method})`;
    case "SKILL_OBSERVED": return `👁️ ${e.entityId} observing ${e.skillId} (${e.observedTicks}/${e.requiredTicks})`;
    case "TECHNOLOGY_UNLOCKED": return `🏛️ tribe ${e.tribeId} unlocked ${e.technologyId}`;
    case "TRIBE_GATHER_POINT_UPDATED": return `⛺ ${e.tribeId} gather → (${e.position?.x},${e.position?.y}) [${e.memberCount} members]`;
    case "SOCIAL_MEMORY_UPDATED": return `👥 ${e.entityId} → ${e.targetEntityId} trust:${e.trust?.toFixed(2)}`;
    case "SEMANTIC_FORMED": return `🧠 ${e.entityId} learned: ${e.fact}${e.subject ? ` (${e.subject})` : ""} [conf:${e.confidence?.toFixed(1)}]`;
    case "KNOWLEDGE_TAUGHT": return `📖 ${e.entityId} taught ${e.fact} to tribe ${e.tribeId}`;
    case "KNOWLEDGE_INHERITED": return `📜 ${e.entityId} inherited ${e.fact} from tribe ${e.tribeId}`;
    case "ENTITY_BORN": return `👶 ${e.entityId} born to ${(e.parentIds ?? []).join("+")} (${e.sex})`;
    case "PAIR_BONDED": return `💍 ${e.entity1Id} ❤ ${e.entity2Id}`;
    case "ENTITY_AGED": return `🎂 ${e.entityId} became ${e.newStage} (age ${e.age})`;
    // MVP-05: Faith events
    case "PRAYER_STARTED": return `🙏 ${e.entityId} began praying (faith:${e.faith})`;
    case "PRAYER_COMPLETED": return `🙏 ${e.entityId} prayer complete, awaiting response`;
    case "PRAYER_UNANSWERED": return `😔 ${e.entityId} prayer unanswered, lost ${e.faithLost} faith`;
    case "MIRACLE_PERFORMED": return `✨ ${e.miracleType.toUpperCase()}${e.targetId ? ` → ${e.targetId}` : ""} (cost:${e.cost})`;
    case "FAITH_CHANGED": return `✨ ${e.entityId} faith ${e.oldFaith}→${e.newFaith} (${e.reason})`;
    // MVP-07A: Priest/Ritual events
    case "ROLE_ASSIGNED": return `⛩️ ${e.entityId} became ${e.role} of tribe ${e.tribeId}`;
    case "RITUAL_STARTED": return `🔮 ${e.entityId} began ritual at shrine`;
    case "RITUAL_COMPLETED": return `🔮 Ritual completed at shrine by ${e.entityId}`;
    case "MIRACLE_INTERPRETED": return `📿 Priest ${e.priestId} interprets miracle: "${e.interpretation}"`;
    // MVP-07B: Doctrine events
    case "DOCTRINE_FORMED": return `📜 Doctrine formed: "${e.doctrineId}" (${e.doctrineType}, strength:${e.strength})`;
    case "DOCTRINE_VIOLATED": return `⚠️ Doctrine violated: "${e.doctrineId}"`;
    case "DOCTRINE_REINFORCED": return `📿 Doctrine reinforced: "${e.doctrineId}" (strength:${e.newStrength})`;
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
  document.getElementById("metric-builds")!.textContent = `Builds: ${proj.counters.buildCount}`;

  // Structure count
  const activeStructures = proj.structures.filter(s => s.active).length;
  const totalStructures = proj.structures.length;
  document.getElementById("metric-structures")!.textContent = `🔥 ${activeStructures}/${totalStructures}`;

  // Skill + Tech counts (MVP-02-D)
  const skilledAgents = proj.agents.filter(a => a.alive && Object.keys(a.skills).length > 0).length;
  document.getElementById("metric-skills")!.textContent = `🧠 ${skilledAgents} skilled`;
  document.getElementById("metric-techs")!.textContent = `Skills: ${proj.counters.skillLearnedCount} | Tech: ${proj.counters.techUnlockedCount}`;

  // Tribe info (MVP-02-E)
  const tribe = proj.tribes[0];
  const tribeText = tribe
    ? `⛺ ${tribe.name}: ${tribe.aliveMemberCount}/${tribe.memberCount} alive${tribe.gatherPoint ? ` @ (${tribe.gatherPoint.x},${tribe.gatherPoint.y})` : ""}`
    : "No tribe";
  document.getElementById("metric-tribe")!.textContent = tribeText;

  // Environment (MVP-03-A)
  const env = proj.environment;
  if (env) {
    const icon = env.timeOfDay === "day" ? "🌞" : "🌙";
    const tempColor = env.temperature < 40 ? "🥶" : env.temperature < 50 ? "😐" : "☀️";
    document.getElementById("metric-environment")!.textContent = `${icon} ${env.timeOfDay === "day" ? "Day" : "Night"} | ${tempColor} ${env.temperature.toFixed(0)}°`;
    // Night-mode class on map container
    // Night mode is now handled by PixiJS OverlayLayer
  }
  document.getElementById("metric-shelters")!.textContent = `🛖 ${proj.counters.shelterCount} shelters`;

  // Knowledge counters (MVP-03-B)
  document.getElementById("metric-knowledge")!.textContent = `🧠 ${proj.counters.totalSemanticFacts} facts | 📜 ${proj.counters.totalCulturalFacts} cultural`;

  // Population breakdown (MVP-04)
  document.getElementById("metric-population")!.textContent = `👶 ${proj.counters.childCount} children | 👴 ${proj.counters.elderCount} elders | 💍 ${proj.counters.totalPairBonds} bonds`;

  // Faith metrics (MVP-05) + Spiritual info (MVP-07A)
  const priestAgent = proj.agents.find(a => a.role === "priest");
  const shrineCount = proj.structures.filter(s => s.type === "shrine" && s.active).length;
  const priestLabel = priestAgent ? ` | ⛩️ Priest: ${priestAgent.id}` : "";
  const shrineLabel = shrineCount > 0 ? ` | 🏛️ ${shrineCount} shrine` : "";
  const doctrineCount = proj.tribes.length > 0 ? proj.tribes[0].doctrines.length : 0;
  const doctrineLabel = doctrineCount > 0 ? ` | 📜 ${doctrineCount} doctrines` : "";
  document.getElementById("metric-faith")!.textContent = `🙏 ${proj.counters.prayingCount} praying | ✨ ${proj.counters.totalMiracles} miracles${priestLabel}${shrineLabel}${doctrineLabel}`;
  document.getElementById("divine-points")!.textContent = `✨ Divine: ${proj.divinePoints.toFixed(1)}/${proj.maxDivinePoints}`;

  // Selected agent detail
  const detailEl = document.getElementById("agent-detail")!;
  if (selectedAgentId) {
    const agent = proj.agents.find((a) => a.id === selectedAgentId);
    if (agent) {
      const inv = Object.entries(agent.inventory).map(([k, v]) => `${k}:${v}`).join(" ") || "empty";
      const skills = Object.entries(agent.skills).map(([k, v]) => `${k}:${Math.round(v * 100)}%`).join(" ") || "none";
      const action = agent.lastAction
        ? `${agent.lastAction.type}${agent.lastAction.reason ? ` (${agent.lastAction.reason})` : ""} → ${agent.lastActionResult}`
        : "—";
      const sexIcon = agent.sex === "male" ? "♂" : agent.sex === "female" ? "♀" : "";

      // Agent life events (MVP-06A)
      const lifeEvents = narrativeEngine.getAgentLifeEvents(agent.id);
      const lifeHtml = lifeEvents.length > 0
        ? `<div class="life-events-section">` +
          lifeEvents.slice(-6).map(le =>
            `<div class="life-event-item"><span class="life-event-year">Y${le.year}</span><span class="life-event-desc">${le.description}</span></div>`
          ).join("") +
          `</div>`
        : "";

      detailEl.innerHTML = `
        <strong>${agent.id}</strong> ${sexIcon} age ${agent.age} (${agent.lifeStage})
        &nbsp;|&nbsp; Tribe: ${agent.tribeId}
        &nbsp;|&nbsp; Pos: (${agent.position.x},${agent.position.y})
        &nbsp;|&nbsp; H:${Math.round(agent.needs.hunger ?? 0)} T:${Math.round(agent.needs.thirst ?? 0)} E:${Math.round(agent.needs.exposure ?? 100)}
        &nbsp;|&nbsp; 📦 ${inv}
        &nbsp;|&nbsp; 🧠 skills: ${skills}
        &nbsp;|&nbsp; 👥 knows ${agent.socialMemoryCount}
        &nbsp;|&nbsp; 📚 semantic: ${agent.semanticMemoryCount}
        ${agent.spouseId ? `&nbsp;|&nbsp; 💍 ${agent.spouseId}` : ""}
        ${agent.childCount > 0 ? `&nbsp;|&nbsp; 👶 ${agent.childCount} children` : ""}
        &nbsp;|&nbsp; ✨ faith: ${agent.faith}${agent.isPraying ? " (🙏 praying)" : ""}${agent.role ? ` | ⛩️ ${agent.role}` : ""}
        &nbsp;|&nbsp; Last: ${action}
        &nbsp;|&nbsp; ${agent.alive ? "🟢 alive" : "🔴 dead"}
        ${lifeHtml}
      `;
    }
  } else {
    detailEl.innerHTML = `<span class="detail-label">Click an agent to view details</span>`;
  }
}

// ── Chronicle Panel (MVP-06A) ──────────────────────────────

function renderChronicle(): void {
  const container = document.getElementById("chronicle-log");
  if (!container) return;

  const entries = narrativeEngine.getChronicle();
  const epochs = narrativeEngine.getEpochSummaries();
  container.innerHTML = "";

  if (entries.length === 0 && epochs.length === 0) {
    container.innerHTML = `<div style="padding:12px;color:var(--text-2);font-size:11px;text-align:center;">No events narrated yet. Start the simulation to see the world's story unfold.</div>`;
    return;
  }

  // Interleave and sort descending by tick (epochs use endYear * 40)
  type DisplayItem = { type: 'entry', data: any, sort: number } | { type: 'epoch', data: any, sort: number };
  
  const displayItems: DisplayItem[] = [
    ...entries.slice(0, 50).map(e => ({ type: 'entry' as const, data: e, sort: e.tick })),
    ...epochs.map(e => ({ type: 'epoch' as const, data: e, sort: e.endYear * 40 + 1 }))
  ].sort((a, b) => b.sort - a.sort);

  for (const item of displayItems) {
    if (item.type === 'epoch') {
      const e = item.data;
      const card = document.createElement("div");
      card.className = "epoch-summary-card";
      const title = `The Saga of Years ${e.startYear} - ${e.endYear}`;
      // Replace newline with br
      const bodyFormat = e.body.replace(/\n/g, "<br/>");
      card.innerHTML = `
        <div class="epoch-summary-title">${title}</div>
        <div class="epoch-summary-body">${bodyFormat}</div>
      `;
      container.appendChild(card);
    } else {
      const entry = item.data;
      const card = document.createElement("div");
      card.className = `chronicle-entry ${entry.importance}`;
      card.onclick = () => {
        if (entry.focusEntityId) {
          selectedAgentId = entry.focusEntityId;
          render();
        }
      };

      const body = entry.llmBody ?? entry.body;
      const tagsHtml = entry.tags.map((t: string) => `<span class="chronicle-tag">${t}</span>`).join("");

      card.innerHTML = `
        <div class="chronicle-time">Year ${entry.year} · Tick ${entry.tick}</div>
        <div class="chronicle-title">${entry.title}</div>
        <div class="chronicle-body">${body}</div>
        <div class="chronicle-tags">${tagsHtml}</div>
      `;
      container.appendChild(card);
    }
  }
}

// ── Narrative Toast (MVP-06A) ──────────────────────────────

function renderNarrativeToast(): void {
  const lastEntry = narrativeEngine.getLastEntry();
  const toastEl = document.getElementById("narrative-toast");
  if (!toastEl || !lastEntry) return;

  // Only show toast for major/legendary events
  if (lastEntry.importance === "minor") return;

  // Don't re-show the same entry
  if (toastEl.dataset.entryId === lastEntry.id) return;
  toastEl.dataset.entryId = lastEntry.id;

  const body = lastEntry.llmBody ?? lastEntry.body;
  toastEl.innerHTML = `
    <div class="toast-title">${lastEntry.title}</div>
    <div class="toast-body">${body}</div>
    <div class="toast-meta">Year ${lastEntry.year} · Tick ${lastEntry.tick}</div>
  `;
  toastEl.classList.remove("hidden");

  // Auto-hide after 6 seconds
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 6000);
}

// ── Tab Switching (MVP-06A) ────────────────────────────────

function bindTabs(): void {
  document.querySelectorAll(".panel-tab").forEach((tab) => {
    (tab as HTMLElement).onclick = () => {
      const target = (tab as HTMLElement).dataset.tab;
      // Toggle tab buttons
      document.querySelectorAll(".panel-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      // Toggle tab content
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      document.getElementById(`tab-${target}`)?.classList.add("active");
    };
  });
}

// ── MVP-06B & C: Historian & Oracle ───────────────────────────

function bindHistorian() {
  const btn = document.getElementById("btn-inscribe-era") as HTMLButtonElement | null;
  if (!btn) return;
  
  btn.onclick = async () => {
    const historian = narrativeEngine.getHistorian();
    if (!historian) {
      showSimpleToast("Historian unavailable (LLM disabled)");
      return;
    }

    const wasPlaying = timeCtrl.getMode() === "playing" || timeCtrl.getMode() === "fastForward";
    if (wasPlaying) timeCtrl.pause();

    btn.disabled = true;
    btn.textContent = "⏳ Inscribing Epoch...";

    try {
      const chronicle = narrativeEngine.getChronicle();
      // Gather entries from the last 10 years relative to current tick
      const proj = runner.getProjection();
      const endYear = Math.floor(proj.tick / 40);
      const startYear = Math.max(0, endYear - 10);
      
      const body = await historian.generateEpochSummary([...chronicle], startYear, endYear);
      if (body) {
        narrativeEngine.addEpochSummary({ startYear, endYear, body });
        render(); // Force update of Chronicle tab
      } else {
        showSimpleToast("Not enough history for an epoch.");
      }
    } catch (err) {
      console.error(err);
      showSimpleToast("Historian failed to inscribe.");
    } finally {
      btn.disabled = false;
      btn.textContent = "✒️ Inscribe Era";
      if (wasPlaying) timeCtrl.toggle(); // Resume
    }
  };
}

function bindOracleForm() {
  const form = document.getElementById("oracle-form");
  const input = document.getElementById("oracle-input") as HTMLInputElement | null;
  const btn = document.getElementById("btn-oracle") as HTMLButtonElement | null;
  if (!form || !input || !btn) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // ── MVP-07C: Try local keyword parsing first ──────────
    const localIntent = parseDivineIntent(text);

    if (localIntent.type === "miracle" && localIntent.miracleType) {
      // Handle miracle locally — no LLM needed
      showSimpleToast(`⚡ Divine Will: ${localIntent.reason}`);
      doMiracle({ type: localIntent.miracleType, targetId: localIntent.targetId });
      input.value = "";
      return;
    }

    if (localIntent.type === "doctrine_shift" && localIntent.doctrineId) {
      // Handle doctrine shift locally
      const proj = runner.getProjection();
      const tribe = proj.tribes[0];
      if (tribe && tribe.doctrines.length > 0) {
        const shifted = applyDoctrineShift(
          tribe.doctrines as { id: string; strength: number }[],
          localIntent.doctrineId,
          localIntent.doctrineChange ?? 0
        );
        if (shifted) {
          // Also apply to the actual world state via runner
          const worldTribe = Object.values(runner.getWorld().tribes ?? {})[0];
          if (worldTribe?.doctrines) {
            const worldDoc = worldTribe.doctrines.find(d => d.id === localIntent.doctrineId);
            if (worldDoc) {
              worldDoc.strength = Math.max(0, Math.min(100, worldDoc.strength + (localIntent.doctrineChange ?? 0)));
            }
          }
          showSimpleToast(`📜 Divine decree: ${localIntent.reason}`);
        } else {
          showSimpleToast(`⚠️ Doctrine "${localIntent.doctrineId}" not yet formed by this tribe.`);
        }
      } else {
        showSimpleToast(`⚠️ This tribe has no doctrines yet.`);
      }
      input.value = "";
      render();
      return;
    }

    // ── Fallback: LLM Oracle ──────────────────────────────
    const oracle = narrativeEngine.getOracle();
    if (!oracle) {
      showSimpleToast("Oracle unavailable — no keyword match and LLM disabled.");
      return;
    }

    const wasPlaying = timeCtrl.getMode() === "playing" || timeCtrl.getMode() === "fastForward";
    if (wasPlaying) timeCtrl.pause();

    btn.disabled = true;
    input.disabled = true;
    btn.textContent = "⏳ Praying...";

    try {
      const proj = runner.getProjection();
      
      // Build Oracle Context
      const availableMiracles = [
        { intent: "BLESS", cost: 1, description: "Restores hunger and thirst completely.", needsTarget: true },
        { intent: "HEAL", cost: 1, description: "Cures exposure/freezing completely.", needsTarget: true },
        { intent: "RAIN", cost: 3, description: "Refills all water reservoirs in the world.", needsTarget: false },
        { intent: "BOUNTY", cost: 3, description: "Spawns fresh food nodes around the world.", needsTarget: false }
      ];

      const prayingAgents = proj.agents
        .filter(a => a.alive && a.isPraying)
        .map(a => ({ id: a.id, hunger: a.needs.hunger ?? 0, thirst: a.needs.thirst ?? 0, exposure: a.needs.exposure ?? 100, faith: a.faith }));
        
      const strugglingAgents = proj.agents
        .filter(a => a.alive && !a.isPraying && ((a.needs.hunger ?? 100) < 30 || (a.needs.thirst ?? 100) < 30 || (a.needs.exposure ?? 100) < 40))
        .map(a => ({ id: a.id, hunger: a.needs.hunger ?? 0, thirst: a.needs.thirst ?? 0, exposure: a.needs.exposure ?? 100, faith: a.faith }));

      const context = {
        divinePoints: proj.divinePoints,
        availableMiracles,
        prayingAgents,
        strugglingAgents
      };

      const intent = await oracle.parseDivineWill(text, context);
      
      if (!intent || intent.intent === "NONE") {
        showSimpleToast(`Oracle confused: ${intent?.reason || "Unrecognized command."}`);
      } else {
        showSimpleToast(`Oracle heard: [${intent.intent}] → ${intent.reason}`);
        doMiracle({ type: intent.intent.toLowerCase() as MiracleType, targetId: intent.targetId });
        input.value = ""; // Clear on success
      }
    } catch (err) {
      console.error(err);
      showSimpleToast("Oracle failed to connect.");
    } finally {
      btn.disabled = false;
      input.disabled = false;
      btn.textContent = "✨ Cast";
      input.focus();
      if (wasPlaying) timeCtrl.toggle(); // Resume
    }
  };
}

function showSimpleToast(msg: string) {
  const toastEl = document.getElementById("narrative-toast");
  if (!toastEl) return;
  toastEl.innerHTML = `
    <div class="toast-title">System</div>
    <div class="toast-body">${msg}</div>
  `;
  toastEl.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 4000);
}

// ── Boot ───────────────────────────────────────────────────
init().catch((err) => console.error("[game-client] Init failed:", err));
