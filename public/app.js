const loginForm = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const topLoginStatus = document.querySelector("#topLoginStatus");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const loginStatus = document.querySelector("#loginStatus");
const newRequestButton = document.querySelector("#newRequestButton");

let conversation = [];
let activeIntent = "";
let sessionToken = "";
let currentUser = "";
let latestTrace = null;
let conversationId = makeConversationId();

loginForm.addEventListener("submit", handleLogin);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userText = chatInput.value.trim();

  if (!userText) {
    return;
  }

  addMessage("user", userText);
  conversation.push({ role: "user", content: userText });
  chatInput.value = "";

  const assistantMessage = addMessage("assistant", statusMessageFor(userText));

  try {
    const response = await fetch("/api/chat-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: conversation,
        activeIntent: activeIntent,
        sessionToken: sessionToken,
        conversationId: conversationId
      })
    });

    await readChatStream(response, assistantMessage, userText);
  } catch (error) {
    assistantMessage.textContent = "Sorry, I could not reach the chat server.";
  }
});

async function readChatStream(response, assistantMessage, userText) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let savedText = "";
  let pendingText = "";
  let hasStartedAnswer = false;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    pendingText += decoder.decode(result.value, { stream: true });
    const lines = pendingText.split("\n");
    pendingText = lines.pop();

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(line);

      if (event.type === "status" && !hasStartedAnswer) {
        assistantMessage.textContent = event.text;
      }

      if (event.type === "meta") {
        if (event.isNewTopic) {
          conversation = [{ role: "user", content: userText }];
        }

        activeIntent = event.intent || activeIntent;

        if (event.trace) {
          latestTrace = event.trace;
          renderOperationsConsole(latestTrace);
        }
      }

      if (event.type === "error") {
        assistantMessage.textContent = event.text;
      }

      if (event.type === "chunk") {
        if (!hasStartedAnswer) {
          assistantMessage.textContent = "";
          hasStartedAnswer = true;
        }

        assistantMessage.textContent += event.text;
        savedText += event.text;
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  }

  savedText = savedText.trim();

  if (savedText) {
    conversation.push({ role: "assistant", content: savedText });
  }
}

newRequestButton.addEventListener("click", () => {
  conversation = [];
  activeIntent = "";
  conversationId = makeConversationId();
  chatMessages.innerHTML = "";
  addMessage("assistant", "New support request started. What can I help with?");
  chatInput.focus();
});

async function handleLogin(event) {
  event.preventDefault();

  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: usernameInput.value.trim(),
      password: passwordInput.value
    })
  });

  const data = await response.json();

  if (!response.ok) {
    loginStatus.textContent = data.error || "Login failed.";
    topLoginStatus.textContent = "Login failed";
    return;
  }

  sessionToken = data.sessionToken;
  currentUser = data.username;
  loginStatus.textContent = `You are logged in as ${currentUser}. Secure support requests are unlocked.`;
  topLoginStatus.textContent = `Logged in as ${currentUser}`;
  passwordInput.value = "";
}

function statusMessageFor(text) {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("policy") ||
    lowerText.includes("shipping") ||
    lowerText.includes("how long")
  ) {
    return "Checking policy document...";
  }

  if (
    lowerText.includes("refund") ||
    lowerText.includes("return")
  ) {
    return "Checking return eligibility...";
  }

  if (
    lowerText.includes("order") ||
    lowerText.includes("tracking") ||
    lowerText.includes("delivery")
  ) {
    return "Using order lookup tool...";
  }

  return "Reviewing your request...";
}

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}-message`;
  message.textContent = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function makeConversationId() {
  return `conv_${Date.now().toString(36)}`;
}

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
