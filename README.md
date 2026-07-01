# Bookly

Bookly is a customer support demo for an online bookstore. It includes a simple login, a streaming chat agent, mocked support tools, and a lightweight Python orchestration layer.

## Live Demo

Use the public app here:

```text
https://support-bookly.onrender.com/
```

Demo accounts:

```text
user1 / password123
user2 / password456
```

Some support flows require login because they use private order information. General policy questions do not require login.

## What The Agent Can Do

- Answer order status questions
- Start a return or refund request
- Escalate a support issue to a teammate
- Answer shipping, return, and refund policy questions
- Ask for missing details before taking action
- Stream the answer into the chat as it is generated
- Emit a shared trace that explains the workflow, tools, knowledge, and decision used

## Decagon-Inspired Operations Console

The page includes a clearly labeled `Decagon-inspired CX Operations Console`. It is a mock operations layer, not Decagon's real interface, tools, or APIs.

After each agent turn, the backend sends one shared `trace` object to the browser. The console uses that trace to update the latest workflow, decision, tool calls, audit log, outcome, and Watchtower reasoning.

For the strongest demo sequence:

1. Run the approved refund test with `user2`.
2. Open **Conversation Trace** to explain the AOP, policy checks, and mocked refund action.
3. Run the outside-window test with `user1`.
4. Open **Watchtower** to show why teammate review is required.

## Four Recommended Tests

### 1. Approved Refund

Log in with `user2 / password456`, then send:

```text
I want to return order BK-77510 because the cover arrived damaged.
```

Expected: a mocked `$29.00` refund is approved. Conversation Trace shows `@orders.lookup`, `@policy.check_return_window`, and `@refund.create_mock`. Watchtower shows **Not flagged** and **Low** risk.

### 2. Outside-Window Escalation

Log in with `user1 / password123`, then send:

```text
I want to return order BK-20045 because the cover arrived damaged.
```

Expected: the 45-day-old order is escalated. The trace shows `@escalation.create_mock`, and Watchtower flags **Refund Policy Exceptions > Outside return window**.

### 3. Private Access Without Login

Reload the page without logging in, then send:

```text
I want to return order BK-77510 because the cover arrived damaged.
```

Expected: the agent asks the customer to log in. The trace shows **Blocked Private Tool Access**, and no private order details are returned.

### 4. Shipping Policy

No login is needed. Send:

```text
How long does shipping usually take?
```

Expected: the agent gives the grounded 3-5 day standard and 1-2 day express shipping answer. The trace shows `@policy.retrieve` and **Shipping Policy Answer**.

For the multi-turn order status flow, log in as `user1`, ask `Where is my order?`, and then provide `BK-10293` when the agent asks for the missing order number.


## How It Works

- `public/index.html` contains the page layout.
- `public/app.js` handles login, streaming chat, the current support topic, and trace-driven console updates.
- `server.py` runs the Python server and orchestration layer.
- `orders.json` stores mocked order data grouped by demo user.
- `policies.md` stores the shipping, return, and refund policy text.

The orchestrator uses Claude Haiku when `ANTHROPIC_API_KEY` is set. Claude returns a small JSON routing decision with the intent, order number, return reason, and whether the user started a new topic. If Claude is unavailable, the app uses a small local fallback so the demo still works.

## Running Or Deploying

The app is already deployed on Render at the live URL above.

Render settings:

```text
Build Command: pip install -r requirements.txt
Start Command: python server.py
```

Environment variables:

```text
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ROUTER_MODEL=claude-haiku-4-5-20251001
```

The server reads Render's `PORT` environment variable automatically. No external Python packages are required.

## Demo Auth Note

This project uses simple demo authentication so other people can test the private support flows. Login returns a random in-memory session token that maps back to the demo user.

For production, replace this with real signed sessions, a database-backed session store, or SSO.
