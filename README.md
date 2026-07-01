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

The operations console has its own page:

```text
https://support-bookly.onrender.com/operations.html
```

It is clearly labeled `Decagon-inspired CX Operations Console`. It is a mock operations layer, not Decagon's real interface, tools, or APIs.

After each agent turn, the backend sends one shared `trace` object to the browser. The customer page saves the latest trace in browser storage, and the operations page reads it to update the workflow, decision, tool calls, audit log, outcome, and Watchtower reasoning. If both pages are open, the console updates automatically.

The existing Claude routing call also makes a separate QA judgment by returning a conversation category, flags, and a short rationale. Watchtower combines that model judgment with tool facts, such as a failed 30-day return-window check, without translating the final route decision through a category lookup.

For the strongest demo sequence:

1. Open the Operations Console link in a separate tab.
2. Run the approved refund test with `user2` on the customer support page.
3. Open **Conversations** to review the transcript, summary, outcome, and workflow decision.
4. Run the outside-window test with `user1`.
5. Open **Watchtower** to show why teammate review is required.

## Four Recommended Refund Tests

### 1. Approved Refund

Log in with `user2 / password456`, then send:

```text
I want to return order BK-77510 because the cover arrived damaged.
```

Expected: a mocked `$29.00` refund is approved. Conversations shows the customer/agent transcript and resolution, while Watchtower shows **Not flagged** and **Low** risk.

### 2. Outside-Window Escalation

Log in with `user1 / password123`, then send:

```text
I want to return order BK-20045 because the cover arrived damaged.
```

Expected: the 45-day-old order is escalated. The trace shows `@escalation.create_mock`, and Watchtower flags **Refund Policy Exceptions > Outside return window**.

### 3. Multi-Turn Refund Clarification

Log in with `user1 / password123`, then send:

```text
I want to return a damaged book.
```

Expected: the agent asks for the missing order number before checking eligibility. Reply with `BK-10293` to continue the same refund request.

### 4. Private Access Without Login

Reload the page without logging in, then send:

```text
I want to return order BK-77510 because the cover arrived damaged.
```

Expected: the agent asks the customer to log in. The trace shows **Blocked Private Tool Access**, and no private order details are returned.

### Inspecting a Failed QA Test

Open **Testing** in the Operations Console. The failed test shows a customer asking for a human after an outside-window refund denial. Select **Review** to open its simulated transcript in **Conversations**, where the missed escalation and **Needs improvement** QA result are visible.

Each test expands into ordered checkpoints and an evaluation rationale. These tests are illustrative and do not execute a real CI/CD evaluation harness.


## How It Works

- `public/index.html` contains the customer support page.
- `public/app.js` handles login, streaming chat, the current support topic, and saving the latest trace.
- `public/operations.html` contains the standalone operations console.
- `public/operations.js` reads saved traces and updates the console.
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
