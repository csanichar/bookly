const loginForm = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const topLoginStatus = document.querySelector("#topLoginStatus");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const loginStatus = document.querySelector("#loginStatus");
const newRequestButton = document.querySelector("#newRequestButton");

const TRACE_STORAGE_KEY = "booklyLatestTrace";

let conversation = [];
let activeIntent = "";
let sessionToken = "";
let currentUser = "";
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
          saveLatestTrace(event.trace);
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

  if (lowerText.includes("refund") || lowerText.includes("return")) {
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

function saveLatestTrace(trace) {
  try {
    localStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(trace));
  } catch (error) {
    console.warn("The latest operations trace could not be saved.");
  }
}
