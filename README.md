# Bookly

Bookly is a small customer support website for an online bookstore. It uses plain HTML, CSS, a little browser JavaScript, and a tiny Python server.

## What is included

- A customer support homepage
- A demo username/password login form
- A simple chatbot UI
- A Python orchestrator in `server.py`
- A Claude Haiku router for choosing the right support flow
- Fake order tools backed by `orders.json`
- A local policy document in `policies.md`
- Server-side demo session checking for private support requests
- A "New request" button that clears the current support case
- Human escalation messaging with `support@bookly.com`
- Streaming chat responses from `/api/chat-stream`

## How to run it

1. Make sure Python is installed.
2. Copy `.env.example` to `.env`.
3. Add your Anthropic API key to `.env`.
4. Run:

```bash
python server.py
```

5. Open:

```text
http://localhost:3000
```

## Render deploy

Live demo URL:

```text
https://support-bookly.onrender.com/
```

Render requires web services to listen on `0.0.0.0` and the `PORT` environment variable. `server.py` already does this.

Use these Render settings:

```text
Build Command: pip install -r requirements.txt
Start Command: python server.py
```

Add these environment variables in Render:

```text
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ROUTER_MODEL=claude-haiku-4-5-20251001
```

After Render gives you a URL like `https://your-service.onrender.com`, you can share that URL with demo users.

## Demo login

The app uses simple demo users so anyone can try the private support flows.

Demo accounts:

```text
user1 / password123
user2 / password456
```

`public/app.js` sends the username and password to `/api/login`.

If the login succeeds, `server.py` returns a random demo session token. The server keeps a small in-memory map from token to username, and the browser sends that token with each chat message.

This is still demo authentication. It is safer than a predictable token, but production should use real signed sessions, a database-backed session store, or SSO.

Private support questions include refunds, returns, order status, delivery details, payment, account, or address questions.

## Orchestrator flows

`server.py` routes the latest message with `route_with_claude()`.

The router asks a lightweight Claude model to return JSON with:

```json
{
  "intent": "order_status",
  "private_request": true,
  "is_new_topic": false,
  "order_number": "BK-10293",
  "reason": ""
}
```

If Claude cannot be reached, `server.py` logs a clear fallback message and uses a small local fallback so the demo can still run.

The frontend sends `activeIntent` with each request. That lets the server understand short follow-ups like `BK-10293` without dragging old unrelated topics into the next support case.

Use the **New request** button when you want to clear the current case and pivot to a different topic.

If the customer asks to escalate or speak to a person, the router uses `human_escalation` and the response points them to `support@bookly.com`.

## Streaming

The browser sends chat messages to `/api/chat-stream`.

The server sends small JSON events back one line at a time:

```json
{"type": "status", "text": "Using order lookup tool..."}
{"type": "chunk", "text": "Thanks. "}
{"type": "done"}
```

`public/app.js` reads those events and adds the answer to the chat bubble as it arrives.

Flow 1: order status

- If the user asks where an order is but does not give an order number, the agent asks for it.
- If the user gives an order number like `BK-10293`, the agent looks it up in `orders.json`.
- Orders are grouped by demo username in `orders.json`.
- `user1` can access `BK-10293` and `BK-20045`.
- `user2` can access `BK-88421` and `BK-77510`.

Flow 2: return or refund

- If the user asks for a return but leaves out the order number or reason, the agent asks for the missing details.
- The router extracts `order_number` and `reason`, so natural wording like "the spine was crushed in transit" can be handled directly.
- If the order is inside the 30-day window and the item is damaged, the fake refund is approved.
- If the order is outside the 30-day window, the agent escalates to a teammate.
- Escalated cases tell the customer to email `support@bookly.com` and include the order context.

Flow 3: policy questions

- Shipping, return, and refund policy answers come from `policies.md`.
- This is not a full RAG system yet, but it gives you a simple place to store policy facts.
- If an Anthropic key is available, Claude receives the policy text and writes a short grounded answer.
- If the policy does not contain the requested information, the agent politely points the customer to `support@bookly.com`.

## Test cases

Use the live demo URL or local app, then log in with `user1 / password123`.

Test case 1: order status

```text
Hi, can you tell me where my order is?
```

Then:

```text
BK-10293
```

Expected result: the agent looks up `BK-10293` and says it is out for delivery today.

Test case 2: refund approval

```text
I want to return a book.
```

Then:

```text
Order BK-10293, the cover arrived damaged.
```

Expected result: the agent approves the return and refund because the order is inside the 30-day window.

Test case 3: refund escalation

```text
I want to return order BK-20045 because the cover arrived damaged.
```

Expected result: the agent escalates to a teammate and tells the user to email `support@bookly.com`.

Extra policy question, no login needed:

```text
How long does shipping usually take?
```
