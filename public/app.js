const loginButton = document.querySelector("#googleLoginButton");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const loginStatus = document.querySelector("#loginStatus");
const newRequestButton = document.querySelector("#newRequestButton");

let conversation = [];
let activeIntent = "";
let googleToken = "";
let googleClientId = "";

window.addEventListener("load", renderGoogleButton);

function renderGoogleButton() {
  if (!window.google) {
    setTimeout(renderGoogleButton, 300);
    return;
  }

  loadGoogleClientId();
}

async function loadGoogleClientId() {
  const response = await fetch("/api/config");
  const config = await response.json();
  googleClientId = config.googleClientId;

  if (!googleClientId) {
    loginButton.textContent = "Missing Google Client ID";
    loginStatus.textContent = "Add GOOGLE_CLIENT_ID to your .env file, then restart the server.";
    return;
  }

  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleLogin
  });

  google.accounts.id.renderButton(loginButton, {
    theme: "outline",
    size: "large",
    text: "signin_with"
  });
}

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
        googleToken: googleToken
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
  chatMessages.innerHTML = "";
  addMessage("assistant", "New support request started. What can I help with?");
  chatInput.focus();
});

function handleGoogleLogin(response) {
  googleToken = response.credential;
  loginButton.textContent = "Logged in with Google";
  loginStatus.textContent = "You are logged in. Secure support requests are unlocked.";
}

function statusMessageFor(text) {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("order") ||
    lowerText.includes("refund") ||
    lowerText.includes("return") ||
    lowerText.includes("tracking") ||
    lowerText.includes("delivery")
  ) {
    return "Searching order information...";
  }

  if (
    lowerText.includes("policy") ||
    lowerText.includes("shipping") ||
    lowerText.includes("how long")
  ) {
    return "Searching policy information...";
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

function removeLastAssistantMessage() {
  const assistantMessages = document.querySelectorAll(".assistant-message");
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

  if (lastAssistantMessage) {
    lastAssistantMessage.remove();
  }
}
