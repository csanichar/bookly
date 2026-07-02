const TRACE_STORAGE_KEY = "booklyLatestTrace";
let latestLiveTrace = null;

// This simulated trace gives the failed test a conversation that can be reviewed.
const FAILED_REFUND_TEST_TRACE = {
  authenticated: true,
  username: "user1",
  intent: "refund_return",
  workflow: "Refund / Return Resolution",
  workflowVersion: "v1.4",
  decision: "refund_denied_without_escalation",
  summary: "An outside-window refund request was redirected to support email instead of being escalated to the CRM.",
  resolution: "Failed evaluation: the agent should have called @escalation.create_mock and sent the order number and return reason to the CRM, but it only directed the customer to support@bookly.com.",
  tags: ["flagged", "Refund Policy Exceptions"],
  evaluationStatus: "failed",
  watchtower: { risk: "high" },
  transcript: [
    { role: "user", content: "I need a refund for order BK-20045. The book arrived with a crushed spine." },
    { role: "assistant", content: "Order BK-20045 was delivered 45 days ago and is outside Bookly's 30-day return window. I cannot process the refund automatically. Please email support@bookly.com for additional help." }
  ]
};

const NEGATIVE_SENTIMENT_TRACE = {
  authenticated: true,
  username: "user2",
  intent: "human_escalation",
  workflow: "Human Escalation",
  workflowVersion: "v1.0",
  decision: "escalated_customer_request",
  summary: "The customer expressed strong frustration after repeating a damaged-book refund request.",
  resolution: "The agent acknowledged the frustration and created a teammate handoff with the conversation context.",
  tags: ["flagged", "Negative Sentiment"],
  evaluationStatus: "passed",
  watchtower: { risk: "high" },
  transcript: [
    { role: "user", content: "This is incredibly frustrating. I have explained the damaged book twice and still do not have a refund." },
    { role: "user", content: "I need to speak with a person who can actually resolve this." },
    { role: "assistant", content: "I am sorry this has been frustrating. I have created a teammate handoff and included your previous refund context so you will not need to repeat it." }
  ]
};

const SHIPPING_POLICY_TRACE = {
  authenticated: false,
  username: "",
  intent: "policy",
  workflow: "Shipping Policy Answer",
  workflowVersion: "v1.0",
  decision: "policy_answered",
  summary: "The customer asked how long Bookly shipping usually takes.",
  resolution: "The agent answered from the shipping policy without requiring account access.",
  tags: ["deflected"],
  evaluationStatus: "passed",
  watchtower: { risk: "low" },
  transcript: [
    { role: "user", content: "How long does shipping usually take?" },
    { role: "assistant", content: "Standard shipping is 3-5 business days, and express shipping is 1-2 business days." }
  ]
};

const ORDER_STATUS_TRACE = {
  authenticated: true,
  username: "user1",
  intent: "order_status",
  workflow: "Order Status Lookup",
  workflowVersion: "v1.0",
  decision: "order_status_found",
  summary: "The customer requested a delivery update and provided the order number after one clarification.",
  resolution: "Order BK-10293 was found and its current delivery status was provided.",
  tags: ["deflected"],
  evaluationStatus: "passed",
  watchtower: { risk: "low" },
  transcript: [
    { role: "user", content: "Hi, can you tell me where my order is?" },
    { role: "assistant", content: "Happy to help. What's your order number?" },
    { role: "user", content: "It's BK-10293." },
    { role: "assistant", content: "Thanks. Order BK-10293 shipped on the 18th and is out for delivery today." }
  ]
};

const RETURN_EXCEPTION_TRACE = {
  authenticated: true,
  username: "user1",
  intent: "refund_return",
  workflow: "Refund / Return Resolution",
  workflowVersion: "v1.4",
  decision: "escalated_outside_return_window",
  summary: "The customer requested a refund for a damaged book delivered outside the 30-day window.",
  resolution: "The automatic refund was withheld and a CRM teammate-review handoff was created with the order context.",
  tags: ["flagged", "Refund Policy Exceptions"],
  evaluationStatus: "passed",
  watchtower: { risk: "medium" },
  transcript: [
    { role: "user", content: "I want to return order BK-20045 because the cover arrived damaged." },
    { role: "assistant", content: "Order BK-20045 was delivered 45 days ago, past our 30-day return window. I created a teammate review in the CRM and included your order number and damage reason, so you will not need to repeat them." }
  ]
};

const INSIGHTS_VIEWS = {
  all: {
    total: "6,340",
    description: "AI-labeled Bookly support categories across all conversations.",
    values: [31, 24, 17, 12, 8, 8]
  },
  deflected: {
    total: "4,692",
    description: "Categories resolved without teammate intervention.",
    values: [25, 30, 23, 9, 4, 9]
  },
  undeflected: {
    total: "1,648",
    description: "Categories that required follow-up, escalation, or remained open.",
    values: [48, 8, 5, 20, 14, 5]
  }
};

const INSIGHTS_COLORS = ["#e87955", "#5b67d8", "#72c86a", "#e9a23b", "#8667d7", "#cfd3dc"];

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

function primaryConversationTag(trace) {
  return (trace.tags && trace.tags[0]) || "Uncategorized";
}

function renderOperationsConsole(trace) {
  latestLiveTrace = trace;
  renderHome(trace);
  renderInsights(trace);
  renderBuildAop(trace);
  renderConversations(trace);
  renderWatchtower(trace);
  renderTesting(trace);

  const liveStatus = document.querySelector("#consoleLiveStatus");
  setPill(liveStatus, `Conversation updated: ${readable(trace.decision)}`, "success");
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
  setText("latestCategory", trace.watchtower.category || readable(trace.intent));
  setText("insightsSummary", trace.summary);
}

function renderInsightsDistribution(viewName) {
  const view = INSIGHTS_VIEWS[viewName];
  const donut = document.querySelector("#insightsDonut");
  let start = 0;

  const colorStops = view.values.map((value, index) => {
    const end = start + value;
    const stop = `${INSIGHTS_COLORS[index]} ${start}% ${end}%`;
    start = end;
    return stop;
  });

  donut.style.background = `conic-gradient(${colorStops.join(", ")})`;
  donut.setAttribute("aria-label", `Illustrative category distribution for ${viewName} conversations`);
  setText("insightsTotal", view.total);
  setText("insightsViewLabel", view.description);

  document.querySelectorAll("[data-insight-value]").forEach((element) => {
    const index = Number(element.dataset.insightValue);
    element.textContent = `${view.values[index]}%`;
  });
}

function renderBuildAop(trace) {
  const status = document.querySelector("#aopStatus");
  const isActive = trace.intent === "refund_return";
  setPill(status, isActive ? "Selected for latest turn" : "Active mock", isActive ? "success" : "neutral");
  setText("buildSuggestedGap", trace.suggestedKnowledgeGap || "No knowledge gap suggested.");
}

function renderConversations(trace, selectedRowId = "latestConversationRow") {
  const person = trace.authenticated ? trace.username : "Anonymous customer";
  setText("conversationPerson", person);
  setText("conversationSummary", trace.summary);
  setText("conversationResolution", trace.resolution);
  setText("conversationWorkflow", `${trace.workflow} ${trace.workflowVersion}`);
  setText("conversationDecision", readable(trace.decision));
  setText("conversationRisk", readable(trace.watchtower.risk));
  if (selectedRowId === "latestConversationRow") {
    const latestTag = document.querySelector("#conversationLatestTag");
    const tag = primaryConversationTag(trace);
    latestTag.textContent = readable(tag);
    latestTag.className = `conversation-tag ${tag === "flagged" ? "warning" : ""}`;
    setText("conversationLatestTitle", trace.summary);
    setText("conversationLatestTime", "Updated just now");
  }

  document.querySelectorAll(".conversation-row").forEach((row) => {
    row.classList.toggle("active", row.id === selectedRowId);
  });

  const failedEvaluation = trace.evaluationStatus === "failed";
  const passedEvaluation = trace.evaluationStatus === "passed";
  let issueStatus = "Unassigned";
  let resolutionQuality = "Not reviewed";

  if (failedEvaluation) {
    issueStatus = "In review";
    resolutionQuality = "Needs improvement";
  } else if (passedEvaluation) {
    issueStatus = "Resolved";
    resolutionQuality = "Correct";
  }

  document.querySelector("#conversationIssueStatus").value = issueStatus;
  document.querySelector("#conversationQuality").value = resolutionQuality;

  const authPill = document.querySelector("#conversationAuth");
  setPill(authPill, trace.authenticated ? "Authenticated" : "Not authenticated", trace.authenticated ? "success" : "warning");

  const tags = document.querySelector("#conversationTags");
  tags.innerHTML = "";
  (trace.tags || []).forEach((tag) => {
    const element = document.createElement("span");
    const normalizedTag = tag.toLowerCase();
    element.textContent = readable(tag);
    element.className = normalizedTag === "deflected"
      ? "deflected"
      : normalizedTag === "flagged"
        ? "flagged"
        : "criteria";
    tags.appendChild(element);
  });

  const transcript = document.querySelector("#conversationTranscript");
  transcript.innerHTML = "";
  const messages = trace.transcript || [];

  if (messages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = "This saved conversation does not include a transcript.";
    transcript.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("div");
    item.className = `transcript-message ${message.role}`;
    const role = document.createElement("span");
    const content = document.createElement("p");
    role.textContent = message.role === "user" ? "Customer" : "Bookly Agent";
    content.textContent = message.content;
    item.append(role, content);
    transcript.appendChild(item);
  });
}

function renderWatchtower(trace) {
  const watchtower = trace.watchtower;
  setText("watchMatched", watchtower.matchedWatchtower || "No Watchtower matched");
  setText("watchRisk", readable(watchtower.risk));
  setText("watchCategory", watchtower.category || "None");
  setText("watchSeverity", readable(watchtower.severity));
  setText("watchSource", readable(watchtower.classificationSource));
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

function selectConsolePanel(panelId) {
  document.querySelectorAll(".console-tab").forEach((tab) => {
    const isSelected = tab.dataset.panel === panelId;
    tab.classList.toggle("active", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
  });

  document.querySelectorAll(".console-panel").forEach((panel) => {
    const isSelected = panel.id === panelId;
    panel.hidden = !isSelected;
    panel.classList.toggle("active", isSelected);
  });
}

function openSavedConversation(trace, rowId) {
  renderConversations(trace, rowId);
  selectConsolePanel("conversationsPanel");
}

function openFailedRefundConversation() {
  openSavedConversation(FAILED_REFUND_TEST_TRACE, "failedRefundConversationRow");
}

function openNegativeSentimentConversation() {
  openSavedConversation(NEGATIVE_SENTIMENT_TRACE, "negativeSentimentConversationRow");
}

document.querySelectorAll(".console-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectConsolePanel(tab.dataset.panel);
  });
});

document.querySelector("#failedRefundConversationRow").addEventListener("click", openFailedRefundConversation);
document.querySelector("#negativeSentimentConversationRow").addEventListener("click", openNegativeSentimentConversation);
document.querySelector("#shippingConversationRow").addEventListener("click", () => {
  openSavedConversation(SHIPPING_POLICY_TRACE, "shippingConversationRow");
});
document.querySelector("#orderStatusConversationRow").addEventListener("click", () => {
  openSavedConversation(ORDER_STATUS_TRACE, "orderStatusConversationRow");
});
document.querySelector("#returnExceptionConversationRow").addEventListener("click", () => {
  openSavedConversation(RETURN_EXCEPTION_TRACE, "returnExceptionConversationRow");
});
document.querySelector("[data-open-failed-refund]").addEventListener("click", openFailedRefundConversation);
setText("failedTestRationale", FAILED_REFUND_TEST_TRACE.resolution);
document.querySelector("#latestConversationRow").addEventListener("click", () => {
  if (latestLiveTrace) {
    renderConversations(latestLiveTrace);
  }
});

document.querySelectorAll(".insights-filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".insights-filter-button").forEach((otherButton) => {
      const isSelected = otherButton === button;
      otherButton.classList.toggle("active", isSelected);
      otherButton.setAttribute("aria-selected", String(isSelected));
    });
    renderInsightsDistribution(button.dataset.insightsView);
  });
});

renderInsightsDistribution("all");

document.querySelectorAll(".build-subtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".build-subtab").forEach((otherTab) => {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle("active", isSelected);
      otherTab.setAttribute("aria-selected", String(isSelected));
    });

    document.querySelectorAll(".build-view").forEach((view) => {
      const isSelected = view.id === tab.dataset.buildView;
      view.hidden = !isSelected;
      view.classList.toggle("active", isSelected);
    });
  });
});

function filterKnowledge() {
  const query = document.querySelector("#knowledgeSearch").value.toLowerCase().trim();
  const tag = document.querySelector('input[name="knowledgeTag"]:checked').value;
  const source = document.querySelector('input[name="knowledgeSource"]:checked').value;
  const customOnly = document.querySelector("#customSnippetsOnly").checked;
  let visibleCount = 0;

  document.querySelectorAll(".knowledge-snippet").forEach((snippet) => {
    const matchesSearch = snippet.dataset.knowledgeSearch.includes(query);
    const matchesTag = tag === "all" || snippet.dataset.knowledgeTag === tag;
    const matchesSource = snippet.dataset.knowledgeSource === source;
    const isVisible = matchesSearch && matchesTag && matchesSource && !customOnly;
    snippet.hidden = !isVisible;

    if (isVisible) {
      visibleCount += 1;
    }
  });

  setText("knowledgeResultCount", `${visibleCount} ${visibleCount === 1 ? "snippet" : "snippets"}`);
}

document.querySelector("#knowledgeSearch").addEventListener("input", filterKnowledge);
document.querySelectorAll('.knowledge-filters input').forEach((input) => {
  input.addEventListener("change", filterKnowledge);
});

document.querySelector("#conversationSearch").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase().trim();
  document.querySelectorAll("[data-conversation-search]").forEach((row) => {
    row.hidden = !row.dataset.conversationSearch.includes(query);
  });
});

document.querySelector("#aopSearch").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase().trim();

  document.querySelectorAll("[data-aop-search]").forEach((row) => {
    row.hidden = !row.dataset.aopSearch.includes(query);
  });
});

document.querySelector("[data-aop-open]").addEventListener("click", () => {
  document.querySelector("#aopListView").hidden = true;
  document.querySelector("#aopEditorView").hidden = false;
});

document.querySelector("#backToAopList").addEventListener("click", () => {
  document.querySelector("#aopEditorView").hidden = true;
  document.querySelector("#aopListView").hidden = false;
});

document.querySelectorAll(".preview-mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preview-mode-button").forEach((otherButton) => {
      const isSelected = otherButton === button;
      otherButton.classList.toggle("active", isSelected);
      otherButton.setAttribute("aria-selected", String(isSelected));
    });

    document.querySelectorAll(".preview-view").forEach((view) => {
      view.hidden = view.id !== button.dataset.previewMode;
    });
  });
});

async function runAgentPreview(message, responseId, metaId) {
  const responseElement = document.querySelector(`#${responseId}`);
  const metaElement = document.querySelector(`#${metaId}`);
  responseElement.textContent = "Running preview...";
  metaElement.textContent = "Routing the request";

  try {
    const response = await fetch("/api/chat-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
        activeIntent: "",
        sessionToken: "",
        conversationId: `preview_${Date.now().toString(36)}`
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pendingText = "";
    let answerText = "";

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
        if (event.type === "status") {
          responseElement.textContent = event.text;
        }
        if (event.type === "error") {
          responseElement.textContent = event.text;
        }
        if (event.type === "meta" && event.trace) {
          metaElement.textContent = `${event.trace.workflow} - ${readable(event.trace.decision)}`;
        }
        if (event.type === "chunk") {
          answerText += event.text;
          responseElement.textContent = answerText.trimStart();
        }
      }
    }
  } catch (error) {
    responseElement.textContent = "The preview could not reach the Bookly agent.";
    metaElement.textContent = "Preview unavailable";
  }
}

document.querySelector("#chatPreviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#chatPreviewInput").value.trim();
  if (message) {
    await runAgentPreview(message, "chatPreviewResponse", "chatPreviewMeta");
  }
});

document.querySelector("#emailPreviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const subject = document.querySelector("#emailPreviewSubject").value.trim();
  const message = document.querySelector("#emailPreviewInput").value.trim();
  setText("emailPreviewReplySubject", `Re: ${subject || "Bookly support request"}`);
  if (message) {
    await runAgentPreview(message, "emailPreviewResponse", "emailPreviewMeta");
  }
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
