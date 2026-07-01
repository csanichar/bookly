const TRACE_STORAGE_KEY = "booklyLatestTrace";

function readable(value) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setText(id, text) {
  document.querySelector(`#${id}`).textContent = text;
}

function setPill(element, text, tone) {
  element.textContent = text;
  element.className = `status-pill ${tone}`;
}

function renderOperationsConsole(trace) {
  renderHome(trace);
  renderInsights(trace);
  renderBuildAop(trace);
  renderConversationTrace(trace);
  renderWatchtower(trace);
  renderTesting(trace);

  const liveStatus = document.querySelector("#consoleLiveStatus");
  setPill(liveStatus, `Trace updated: ${readable(trace.decision)}`, "success");
}

function renderHome(trace) {
  setText("homeWorkflow", `${trace.workflow} ${trace.workflowVersion}`);
  setText("homeDecision", readable(trace.decision));
  setText("homeRisk", readable(trace.watchtower.risk));

  let outcome = "In progress";
  if (trace.outcome.escalated) {
    outcome = "Escalated";
  } else if (trace.outcome.resolved) {
    outcome = "Resolved";
  }
  setText("homeOutcome", outcome);
}

function renderInsights(trace) {
  const categories = {
    approved_refund: "Refund / Return Issues > Damaged item",
    escalated_outside_return_window: "Refund / Return Issues > Outside return window",
    needs_order_number: "Refund / Return Issues > Missing order number",
    needs_return_reason: "Refund / Return Issues > Unclear refund reason",
    order_status_found: "Order Status",
    policy_answered: "Shipping Questions",
    escalated_customer_request: "Human Escalations",
    blocked_private_tool_access: "Refund / Return Issues > Authentication required"
  };

  setText("latestCategory", categories[trace.decision] || readable(trace.intent));
  setText("insightsSummary", trace.summary);
}

function renderBuildAop(trace) {
  const status = document.querySelector("#aopStatus");
  const isActive = trace.intent === "refund_return";
  setPill(status, isActive ? "Selected for latest turn" : "Active mock", isActive ? "success" : "neutral");
  document.querySelector("#buildPanel").classList.toggle("aop-selected", isActive);
}

function clearAndBuild(containerId, items, buildItem, emptyText) {
  const container = document.querySelector(`#${containerId}`);
  container.innerHTML = "";
  container.classList.toggle("empty-state", items.length === 0);

  if (items.length === 0) {
    container.textContent = emptyText;
    return;
  }

  items.forEach((item) => container.appendChild(buildItem(item)));
}

function renderConversationTrace(trace) {
  setText("traceSummary", trace.summary);
  setText("traceResolution", trace.resolution);
  setText("traceIntent", readable(trace.intent));
  setText("traceWorkflow", `${trace.workflow} ${trace.workflowVersion}`);
  setText("traceDecision", readable(trace.decision));

  let outcome = "In progress";
  if (trace.outcome.escalated) {
    outcome = "Escalated";
  } else if (trace.outcome.resolved) {
    outcome = "Resolved";
  }
  setText("traceOutcome", outcome);

  const authPill = document.querySelector("#traceAuth");
  const authText = trace.authenticated ? `Authenticated: ${trace.username}` : "Not authenticated";
  setPill(authPill, authText, trace.authenticated ? "success" : "warning");

  clearAndBuild("traceTags", trace.tags || [], (tag) => {
    const element = document.createElement("span");
    element.textContent = tag;
    return element;
  }, "No tags");

  clearAndBuild("traceKnowledge", trace.relevantKnowledge || [], (knowledge) => {
    const item = document.createElement("div");
    item.className = "trace-item";
    const title = document.createElement("strong");
    const snippet = document.createElement("p");
    title.textContent = knowledge.title;
    snippet.textContent = knowledge.snippet;
    item.append(title, snippet);
    return item;
  }, "No policy knowledge was needed for this turn.");

  clearAndBuild("traceTools", trace.tools || [], (tool) => {
    const item = document.createElement("div");
    item.className = "trace-item";
    const heading = document.createElement("div");
    heading.className = "trace-item-heading";
    const name = document.createElement("code");
    const status = document.createElement("span");
    const detail = document.createElement("p");
    name.textContent = tool.name;
    setPill(status, readable(tool.status), tool.status === "blocked" || tool.status === "failed" ? "warning" : "success");
    detail.textContent = tool.detail;
    heading.append(name, status);
    item.append(heading, detail);
    return item;
  }, "No tools were called for this turn.");

  clearAndBuild("traceAudit", trace.auditLog || [], (event) => {
    const row = document.createElement("div");
    const step = document.createElement("strong");
    const detail = document.createElement("span");
    step.textContent = event.step;
    detail.textContent = event.detail;
    row.append(step, detail);
    return row;
  }, "No audit events yet.");
}

function renderWatchtower(trace) {
  const watchtower = trace.watchtower;
  setText("watchMatched", watchtower.matchedWatchtower || "No Watchtower matched");
  setText("watchRisk", readable(watchtower.risk));
  setText("watchCategory", watchtower.category || "None");
  setText("watchSeverity", readable(watchtower.severity));
  setText("watchReason", watchtower.flagReason);
  setText("watchAction", watchtower.recommendedAction);

  const flag = document.querySelector("#watchFlag");
  setPill(flag, watchtower.matched ? "Flagged" : "Not flagged", watchtower.matched ? "warning" : "success");
}

function renderTesting(trace) {
  document.querySelectorAll("[data-test-decision]").forEach((row) => {
    row.classList.toggle("latest-test", row.dataset.testDecision === trace.decision);
  });
}

document.querySelectorAll(".console-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".console-tab").forEach((otherTab) => {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle("active", isSelected);
      otherTab.setAttribute("aria-selected", String(isSelected));
    });

    document.querySelectorAll(".console-panel").forEach((panel) => {
      const isSelected = panel.id === tab.dataset.panel;
      panel.hidden = !isSelected;
      panel.classList.toggle("active", isSelected);
    });
  });
});

const watchtowerJobs = {
  refund: {
    title: "Refund Policy Exceptions",
    purpose: "Detect refund or return conversations that require teammate review or fall outside automatic policy.",
    criteria: "Outside the return window, missing order data, unclear reason, or teammate escalation.",
    filter: "Refund / Return Resolution workflow",
    categories: "Outside return window, Missing order data, Unclear refund reason, Human review required"
  },
  sentiment: {
    title: "Negative Sentiment",
    purpose: "Detect conversations where the customer appears frustrated, angry, confused, or dissatisfied.",
    criteria: "Frustration, urgency, repeated confusion, dissatisfaction, or a request to speak to a human.",
    filter: "All support conversations",
    categories: "Frustrated customer, Repeated issue, Unhappy with policy, Escalation requested"
  }
};

document.querySelectorAll("[data-watchtower-job]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-watchtower-job]").forEach((job) => job.classList.toggle("active", job === button));
    const job = watchtowerJobs[button.dataset.watchtowerJob];
    setText("watchJobTitle", job.title);
    setText("watchJobPurpose", job.purpose);
    setText("watchJobCriteria", job.criteria);
    setText("watchJobFilter", job.filter);
    setText("watchJobCategories", job.categories);
  });
});

function loadLatestTrace() {
  try {
    const savedTrace = localStorage.getItem(TRACE_STORAGE_KEY);
    return savedTrace ? JSON.parse(savedTrace) : null;
  } catch (error) {
    return null;
  }
}

window.addEventListener("storage", (event) => {
  if (event.key === TRACE_STORAGE_KEY && event.newValue) {
    renderOperationsConsole(JSON.parse(event.newValue));
  }
});

const latestTrace = loadLatestTrace();
if (latestTrace) {
  renderOperationsConsole(latestTrace);
}
