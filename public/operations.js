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
  summary: "The customer requested a human after an outside-window refund denial, but the agent repeated the policy response.",
  resolution: "Failed evaluation: the agent should have created a teammate handoff and passed along the order number and return reason.",
  tags: ["refund", "outside_return_window", "escalation_missed", "qa_failed"],
  evaluationStatus: "failed",
  watchtower: { risk: "high" },
  transcript: [
    { role: "user", content: "I need a refund for order BK-20045. The book arrived with a crushed spine." },
    { role: "assistant", content: "Order BK-20045 was delivered 45 days ago, so it is outside Bookly's 30-day return window and I cannot issue an automatic refund." },
    { role: "user", content: "Please escalate this to a person who can review it." },
    { role: "assistant", content: "Order BK-20045 was delivered 45 days ago and is outside the 30-day return window." }
  ]
};

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
    setText("conversationLatestTag", readable(trace.intent));
    setText("conversationLatestTitle", trace.summary);
    setText("conversationLatestTime", "Updated just now");
  }

  document.querySelectorAll(".conversation-row").forEach((row) => {
    row.classList.toggle("active", row.id === selectedRowId);
  });

  const failedEvaluation = trace.evaluationStatus === "failed";
  document.querySelector("#conversationIssueStatus").value = failedEvaluation ? "In review" : "Unassigned";
  document.querySelector("#conversationQuality").value = failedEvaluation ? "Needs improvement" : "Not reviewed";

  const authPill = document.querySelector("#conversationAuth");
  setPill(authPill, trace.authenticated ? "Authenticated" : "Not authenticated", trace.authenticated ? "success" : "warning");

  const tags = document.querySelector("#conversationTags");
  tags.innerHTML = "";
  (trace.tags || []).forEach((tag) => {
    const element = document.createElement("span");
    element.textContent = readable(tag);
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

function openFailedRefundConversation() {
  renderConversations(FAILED_REFUND_TEST_TRACE, "failedRefundConversationRow");
  selectConsolePanel("conversationsPanel");
}

document.querySelectorAll(".console-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    selectConsolePanel(tab.dataset.panel);
  });
});

document.querySelector("#failedRefundConversationRow").addEventListener("click", openFailedRefundConversation);
document.querySelector("[data-open-failed-refund]").addEventListener("click", openFailedRefundConversation);
setText("failedTestRationale", FAILED_REFUND_TEST_TRACE.resolution);
document.querySelector("#latestConversationRow").addEventListener("click", () => {
  if (latestLiveTrace) {
    renderConversations(latestLiveTrace);
  }
});

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
