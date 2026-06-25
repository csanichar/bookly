import json
import mimetypes
import os
import re
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request


BASE_DIR = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
POLICY_FILE = BASE_DIR / "policies.md"
ORDERS_FILE = BASE_DIR / "orders.json"

DEFAULT_ROUTER_MODEL = "claude-haiku-4-5-20251001"
SUPPORT_EMAIL = "support@bookly.com"
DEMO_USERS = {
    "user1": "password123",
    "user2": "password456",
}
SESSIONS = {}


def load_env_file():
    """Read simple KEY=value lines from .env."""
    env_path = BASE_DIR / ".env"

    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def send_json(handler, status_code, data):
    """Send a JSON response back to the browser."""
    response_text = json.dumps(data).encode("utf-8")

    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(response_text)))
    handler.end_headers()
    handler.wfile.write(response_text)


def send_stream_event(handler, data):
    """Send one small JSON event to the browser."""
    event_text = json.dumps(data) + "\n"
    handler.wfile.write(event_text.encode("utf-8"))
    handler.wfile.flush()


def stream_words(handler, text):
    """Send the final answer a few words at a time."""
    words = text.split(" ")

    for word in words:
        send_stream_event(handler, {"type": "chunk", "text": word + " "})
        time.sleep(0.03)

    send_stream_event(handler, {"type": "done"})


def read_json_file(path, default_value):
    """Read a JSON file. If it is missing or broken, use a safe default."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default_value


def latest_user_message(messages):
    """Find the newest user message in the current support case."""
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content", ""))

    return ""


def user_messages_text(messages):
    """Join only user messages from the current support case."""
    texts = []

    for message in messages:
        if message.get("role") == "user":
            texts.append(str(message.get("content", "")))

    return " ".join(texts)


def find_order_number(text):
    """Find an order number like BK-10293."""
    match = re.search(r"\bBK-\d{5}\b", text.upper())

    if match:
        return match.group(0)

    return None


def make_session_token(username):
    """Create a random demo session token and remember who owns it."""
    session_token = secrets.token_urlsafe(32)
    SESSIONS[session_token] = username
    return session_token


def user_from_session_token(session_token):
    """Look up the user for a random demo session token."""
    username = SESSIONS.get(session_token)

    if not username:
        return None

    return {"username": username}


def log(message):
    """Print a helpful server log line."""
    print(f"[Bookly] {message}", flush=True)


def call_claude_json(system_prompt, user_prompt, task_name):
    """Use a small Claude model and ask for JSON only."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not api_key:
        log(f"No ANTHROPIC_API_KEY set. Using local fallback for {task_name}.")
        return None

    body = {
        "model": os.environ.get("ROUTER_MODEL", DEFAULT_ROUTER_MODEL),
        "max_tokens": 250,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }

    api_request = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )

    try:
        with request.urlopen(api_request, timeout=30) as response:
            response_data = json.loads(response.read().decode("utf-8"))

        text = response_data["content"][0]["text"]
        log(f"Claude handled {task_name} with model {body['model']}.")
        return parse_json_text(text)
    except Exception as problem:
        log(f"Claude failed for {task_name}: {problem}. Using local fallback.")
        return None


def parse_json_text(text):
    """Parse JSON from a model response."""
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()

    return json.loads(text)


def route_with_claude(latest_text, active_intent):
    """Ask Claude Haiku which support flow should handle this message."""
    system_prompt = (
        "You route customer support messages for Bookly. Return JSON only. "
        "intent must be one of: order_status, refund_return, policy, human_escalation, general. "
        "If the customer asks to escalate, talk to a human, speak to someone, or contact a "
        "representative, use human_escalation even if active_intent is order_status or refund_return. "
        "private_request is true for order status, refunds, returns, delivery updates, "
        "payments, accounts, or addresses. is_new_topic is true when the latest "
        "message clearly starts a different support topic than active_intent. "
        "Extract order_number when present. Extract reason for refund_return when the "
        "customer gives any reason in natural language."
    )

    user_prompt = json.dumps(
        {
            "active_intent": active_intent,
            "latest_customer_message": latest_text,
            "required_json_shape": {
                "intent": "order_status | refund_return | policy | human_escalation | general",
                "private_request": "boolean",
                "is_new_topic": "boolean",
                "order_number": "string or empty string",
                "reason": "string or empty string",
            },
        }
    )

    routed = call_claude_json(system_prompt, user_prompt, "routing")

    if routed:
        return {
            "intent": routed.get("intent", "general"),
            "private_request": bool(routed.get("private_request", False)),
            "is_new_topic": bool(routed.get("is_new_topic", False)),
            "order_number": str(routed.get("order_number", "")),
            "reason": str(routed.get("reason", "")),
        }

    return fallback_route(latest_text, active_intent)


def fallback_route(latest_text, active_intent):
    """Small fallback for local development when no Anthropic key is set."""
    text = latest_text.lower()
    intent = "general"
    private_request = False
    order_number = find_order_number(latest_text) or ""
    reason = ""

    if asks_for_human(text):
        intent = "human_escalation"
        private_request = False
    elif "refund" in text or ("return" in text and "policy" not in text):
        intent = "refund_return"
        private_request = True
    elif "order" in text or "tracking" in text or "where is" in text:
        intent = "order_status"
        private_request = True
    elif "shipping" in text or "policy" in text or "how long" in text:
        intent = "policy"

    is_new_topic = active_intent not in ["", intent] and intent != "general"

    if order_number and intent == "general" and active_intent:
        intent = active_intent
        is_new_topic = False
        private_request = active_intent in ["order_status", "refund_return"]

    if intent == "refund_return":
        reason = extract_return_reason(latest_text)

    return {
        "intent": intent,
        "private_request": private_request,
        "is_new_topic": is_new_topic,
        "order_number": order_number,
        "reason": reason,
    }


def fill_route_from_context(route, messages):
    """Reuse simple details from the current case when the latest message is short."""
    if not route.get("order_number"):
        route["order_number"] = find_order_number(user_messages_text(messages)) or ""

    return route


def asks_for_human(text):
    """Detect direct requests for a person instead of automation."""
    human_phrases = [
        "human",
        "person",
        "representative",
        "teammate",
        "agent",
        "manager",
        "escalate",
        "someone",
        "support team",
    ]

    return any(phrase in text for phrase in human_phrases)


def extract_return_reason(text):
    """Best-effort fallback reason extraction when Claude is unavailable."""
    cleaned = re.sub(r"\bBK-\d{5}\b", "", text, flags=re.IGNORECASE).strip()

    patterns = [
        r"\bbecause\b(.+)",
        r"\breason is\b(.+)",
        r",(.+)",
    ]

    for pattern in patterns:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)

        if match:
            reason = match.group(1).strip(" .")

            if reason:
                return reason

    return ""


def orders_for_user(user):
    """Load orders that belong to the logged-in user."""
    if not user:
        return {}

    all_orders = read_json_file(ORDERS_FILE, {})
    return all_orders.get(user["username"], {})


def escalation_message(order_number, reason):
    """Default message when a teammate needs to review the case."""
    details = []

    if order_number:
        details.append(f"Order number: {order_number}")

    if reason:
        details.append(f"Reason: {reason}")

    detail_text = ""

    if details:
        detail_text = " Please include this context: " + "; ".join(details) + "."

    return (
        "I can't resolve this automatically, so a teammate needs to review it. "
        f"Please email {SUPPORT_EMAIL} and our support team will take a closer look."
        f"{detail_text}"
    )


def answer_order_status(messages, user, route):
    """Flow 1: ask for an order number, then look up that user's order."""
    text = user_messages_text(messages)
    order_number = route.get("order_number") or find_order_number(text)

    if not order_number:
        return {
            "reply": "Happy to help. What's your order number?",
            "status_message": "Checking what information is needed...",
        }

    order = orders_for_user(user).get(order_number)

    if not order:
        return {
            "reply": f"I could not find order {order_number} on your Bookly account.",
            "status_message": "Searching order information...",
        }

    return {
        "reply": f"Thanks. Order {order_number} {order['status']}. Anything else?",
        "status_message": "Searching order information...",
    }


def answer_refund_request(messages, user, route):
    """Flow 2: collect order number and reason, then approve or escalate."""
    text = user_messages_text(messages)
    order_number = route.get("order_number") or find_order_number(text)
    reason = route.get("reason") or extract_return_reason(text)

    if not order_number:
        return {
            "reply": "I can help with that. What's the order number, and what's the reason for the return?",
            "status_message": "Checking what information is needed...",
        }

    if not reason:
        return {
            "reply": "Thanks. What's the reason for the return?",
            "status_message": "Checking what information is needed...",
        }

    order = orders_for_user(user).get(order_number)

    if not order:
        return {
            "reply": f"I could not find order {order_number} on your Bookly account.",
            "status_message": "Searching order information...",
        }

    if order["delivered_days_ago"] > 30:
        return {
            "reply": (
                f"This order was delivered {order['delivered_days_ago']} days ago, past our "
                "30-day return window. "
                + escalation_message(order_number, reason)
            ),
            "status_message": "Checking return eligibility...",
            "escalated": True,
        }

    return_reason = reason.lower()

    if any(word in return_reason for word in ["damaged", "crushed", "broken", "torn", "wrong"]):
        return {
            "reply": (
                "That order is within the 30-day window, and the item qualifies. "
                f"I've started your return and a refund of {order['refund_amount']} to your "
                "original payment. You'll get a confirmation email."
            ),
            "status_message": "Checking return eligibility...",
        }

    return {
        "reply": escalation_message(order_number, reason),
        "status_message": "Checking return eligibility...",
        "escalated": True,
    }


def answer_policy_question(latest_text):
    """Flow 3: answer from local policy text, with Claude if available."""
    policy_text = POLICY_FILE.read_text(encoding="utf-8")

    system_prompt = (
        "Answer customer policy questions for Bookly using only the policy text. "
        "Keep the answer short. If the answer is not in the policy text, say so."
    )

    user_prompt = json.dumps(
        {
            "policy_text": policy_text,
            "customer_question": latest_text,
            "required_json_shape": {"answer": "short grounded answer"},
        }
    )

    routed = call_claude_json(system_prompt, user_prompt, "policy answer")

    if routed and routed.get("answer"):
        return {
            "reply": routed["answer"],
            "status_message": "Searching policy information...",
        }

    lower_text = latest_text.lower()

    if "shipping" in lower_text or "ship" in lower_text:
        return {
            "reply": "Standard shipping is 3-5 business days, and express shipping is 1-2 business days.",
            "status_message": "Searching policy information...",
        }

    if "return" in lower_text:
        return {
            "reply": "Books can be returned within 30 days of delivery if they are unused or damaged on arrival.",
            "status_message": "Searching policy information...",
        }

    if "refund" in lower_text:
        return {
            "reply": "Refunds go back to the original payment method and usually take 3-7 business days after approval.",
            "status_message": "Searching policy information...",
        }

    return {
        "reply": (
            "Our policy does not contain the information you're looking for. "
            f"For additional inquiries, please send an email to {SUPPORT_EMAIL}."
        ),
        "status_message": "Searching policy information...",
        "escalated": True,
    }


def answer_by_intent(route, messages, user):
    """Call the tool or policy helper that matches the route."""
    latest_text = latest_user_message(messages)
    intent = route["intent"]

    if intent == "order_status":
        return answer_order_status(messages, user, route)

    if intent == "refund_return":
        return answer_refund_request(messages, user, route)

    if intent == "policy":
        return answer_policy_question(latest_text)

    if intent == "human_escalation":
        order_number = route.get("order_number") or find_order_number(user_messages_text(messages))

        return {
            "reply": escalation_message(order_number, "Customer requested human support"),
            "status_message": "Preparing escalation details...",
            "escalated": True,
        }

    return {
        "reply": (
            "I can help with order status, returns, refunds, shipping policy, and account questions. "
            "For example, you can ask where an order is, request a return or refund, ask about shipping times, "
            "or ask to speak with a teammate. What would you like help with?"
        ),
        "status_message": "Reviewing your request...",
    }


class BooklyServer(BaseHTTPRequestHandler):
    def do_GET(self):
        """Serve the HTML, CSS, and browser JavaScript files."""
        if self.path == "/":
            requested_path = PUBLIC_DIR / "index.html"
        else:
            requested_path = PUBLIC_DIR / self.path.lstrip("/")

        try:
            requested_path = requested_path.resolve()
            public_path = PUBLIC_DIR.resolve()

            if public_path not in requested_path.parents and requested_path != public_path:
                send_json(self, 403, {"error": "That file is not allowed."})
                return

            file_bytes = requested_path.read_bytes()
        except FileNotFoundError:
            send_json(self, 404, {"error": "File not found."})
            return

        content_type = mimetypes.guess_type(requested_path)[0] or "text/plain"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(file_bytes)))
        self.end_headers()
        self.wfile.write(file_bytes)

    def do_POST(self):
        """Handle the chatbot API route."""
        if self.path == "/api/login":
            self.handle_login()
            return

        if self.path not in ["/api/chat", "/api/chat-stream"]:
            send_json(self, 404, {"error": "Route not found."})
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body_text = self.rfile.read(content_length).decode("utf-8")

        try:
            body = json.loads(body_text or "{}")
        except json.JSONDecodeError:
            body = {}

        result = handle_chat(body)

        if self.path == "/api/chat":
            send_json(self, result["status_code"], result["data"])
            return

        self.send_response(result["status_code"])
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        if result["status_code"] != 200:
            send_stream_event(self, {"type": "error", "text": result["data"]["error"]})
            send_stream_event(
                self,
                {
                    "type": "meta",
                    "intent": result["data"].get("intent", ""),
                    "isNewTopic": result["data"].get("isNewTopic", False),
                },
            )
            send_stream_event(self, {"type": "done"})
            return

        send_stream_event(self, {"type": "status", "text": result["data"]["statusMessage"]})
        send_stream_event(
            self,
            {
                "type": "meta",
                "intent": result["data"]["intent"],
                "isNewTopic": result["data"]["isNewTopic"],
                "escalated": result["data"]["escalated"],
            },
        )
        stream_words(self, result["data"]["reply"])

    def handle_login(self):
        """Handle demo username/password login."""
        content_length = int(self.headers.get("Content-Length", 0))
        body_text = self.rfile.read(content_length).decode("utf-8")

        try:
            body = json.loads(body_text or "{}")
        except json.JSONDecodeError:
            body = {}

        username = str(body.get("username", ""))
        password = str(body.get("password", ""))

        if DEMO_USERS.get(username) != password:
            send_json(self, 401, {"error": "Invalid username or password."})
            return

        send_json(
            self,
            200,
            {
                "username": username,
                "sessionToken": make_session_token(username),
            },
        )


def handle_chat(body):
    """Run the support orchestrator and return a response dictionary."""
    messages = body.get("messages", [])
    active_intent = body.get("activeIntent", "")
    session_token = body.get("sessionToken", "")

    if not isinstance(messages, list):
        messages = []

    latest_text = latest_user_message(messages)
    route = route_with_claude(latest_text, active_intent)
    route = fill_route_from_context(route, messages)

    if route["is_new_topic"]:
        messages = [{"role": "user", "content": latest_text}]

    user = user_from_session_token(session_token)

    if route["private_request"] and not user:
        return {
            "status_code": 401,
            "data": {
                "error": (
                    "Please log in before asking about refunds, order status, "
                    "delivery details, or account information."
                ),
                "intent": route["intent"],
                "isNewTopic": route["is_new_topic"],
            },
        }

    answer = answer_by_intent(route, messages, user)

    return {
        "status_code": 200,
        "data": {
            "reply": answer["reply"],
            "intent": route["intent"],
            "isNewTopic": route["is_new_topic"],
            "statusMessage": answer.get("status_message", "Reviewing your request..."),
            "escalated": bool(answer.get("escalated", False)),
        },
    }


if __name__ == "__main__":
    load_env_file()

    port = int(os.environ.get("PORT", "3000"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), BooklyServer)

    print(f"Bookly is running on {host}:{port}")
    server.serve_forever()
