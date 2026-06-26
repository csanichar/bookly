# Bookly

Bookly is a small customer support website for an online bookstore. It has a simple login, a chat support agent, mocked order tools, and a lightweight Python orchestration layer.

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

## Test Cases

Use `user1 / password123` for these examples.

### 1. Order Status

Message:

```text
Hi, can you tell me where my order is?
```

The agent should ask for the order number.

Then send:

```text
BK-10293
```

Expected result: the agent uses the mocked order lookup tool and says the order is out for delivery today.

### 2. Policy Question

No login is needed for this one.

Message:

```text
How long does shipping usually take?
```

Expected result: the agent answers from the policy document: standard shipping is 3-5 business days, and express shipping is 1-2 business days.

### 3. Refund Approval

Message:

```text
I want to return a book.
```

The agent should ask for the order number and return reason.

Then send:

```text
Order BK-10293, the cover arrived damaged.
```

Expected result: the agent checks return eligibility and approves the mocked refund because the order is inside the 30-day window.

### 4. Refund Escalation

Message:

```text
I want to return order BK-20045 because the cover arrived damaged.
```

Expected result: the agent sees that the order is outside the 30-day return window, escalates the case, and tells the customer to email `support@bookly.com`.


## How It Works

- `public/index.html` contains the page layout.
- `public/app.js` handles login, chat messages, streaming responses, and the current support topic.
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

The server reads Render's `PORT` environment variable automatically.

## Demo Auth Note

This project uses simple demo authentication so other people can test the private support flows. Login returns a random in-memory session token that maps back to the demo user.

For production, replace this with real signed sessions, a database-backed session store, or SSO.
