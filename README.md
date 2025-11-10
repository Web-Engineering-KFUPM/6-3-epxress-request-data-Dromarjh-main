# Lab: Express Request Data 

## Short Overview
In this lab you will practice reading **request data** in Express: query‑string parameters, route parameters, and simple middleware that validates/normalizes input. You’ll implement a small API that echoes values, composes names, and validates numeric parameters.

> **Note:** Follow `server.js` to implement the lab. The file contains TODO blocks that describe exactly what to build.

## Reading Assignment
- **6.5 Express request data** — zyBooks SWE363 (Fall 2025):  
  https://learn.zybooks.com/zybook/SWE363Fall2025/chapter/6/section/5

## Concepts Used in this lab
Below are the concepts and their code syntax patterns.

### 1) Creating an app and routes
- Spin up an Express app and register route handlers for HTTP verbs (GET, POST, etc.).
- Handlers receive `(req, res)` where `req` contains request data and `res` is used to send responses.

```js
// Generic shape (not your lab code)
import express from "express";
const app = express();
app.get("/path", (req, res) => { /* read req, send res */ });
```

### 2) Reading query‑string parameters
- Use `req.query` to access key/value pairs in the URL after `?`.
- Values arrive as **strings**; validate and convert as needed.

```js
// Generic shape
app.get("/search", (req, res) => {
  const { q, page } = req.query; // e.g., /search?q=books&page=2
  // validate/convert, then respond
});
```

### 3) Reading route parameters
- Use `req.params` to access dynamic path segments declared with `:paramName`.

```js
// Generic shape
app.get("/items/:id", (req, res) => {
  const { id } = req.params; // e.g., /items/123 → id === "123"
  // validate/convert, then respond
});
```

### 4) Param middleware (route parameter middleware)
- `app.param("paramName", handler)` runs **once** when a route containing `:paramName` matches.
- Good for **shared validation** and **normalization** across multiple routes that use the same parameter.

```js
// Example (different from your lab tasks)
app.param("productId", (req, res, next, productId) => {
  const n = Number(productId);
  if (!Number.isFinite(n) || n < 1) {
    return res.status(400).json({ ok: false, error: "productId must be a positive number" });
  }
  req.productId = n; // store normalized value
  next();
});

app.get("/products/:productId", (req, res) => {
  res.json({ ok: true, productId: req.productId });
});
```

### 5) Sending JSON responses
- Use `res.status(code).json(data)` to set status and send JSON.
- If you omit `status`, Express defaults to `200 OK` for successful responses.

```js
// Generic shape
return res.status(400).json({ ok: false, error: "Bad input" });
```

## What Are Query‑String Parameters? Why Are They Used?
**Query‑string parameters** are key/value pairs appended to a URL after a `?`, optionally separated by `&`. Example:  
`/search?q=react&sort=recent`

They are used to **filter, sort, or modify** a request without changing the resource path. They’re ideal for optional inputs like search terms, pagination, and flags because they are easy to add/remove and can be cached/bookmarked.

## How Is URL‑Encoded Data Sent via HTTP? Ways to Post Data Like Forms?
- **application/x-www-form-urlencoded**: Traditional HTML forms send data in key=value pairs joined by `&`, with special characters percent‑encoded (URL‑encoded). The body looks like `name=Ali&age=22`. On the server, middleware decodes this back into an object.
- **multipart/form-data**: Used when uploading files (and text fields). The body is split into parts using boundaries.
- **application/json**: Modern SPAs often send JSON in the body, e.g., `{ "name": "Ali", "age": 22 }`.

**Posting data from forms:**
1. Native HTML `<form method="POST">` with `enctype="application/x-www-form-urlencoded"` (default) or `multipart/form-data` (for files).
2. Programmatic requests via `fetch`/`axios` sending JSON or URL‑encoded bodies.
3. Form libraries or frameworks that wrap these mechanisms.

On the server, you typically enable middleware to parse these bodies, e.g., `express.urlencoded({ extended: true })` for URL‑encoded and `express.json()` for JSON.

## What Are Route Parameters and Why Are They Used?
**Route parameters** are **named placeholders** in the path (e.g., `/users/:userId`) that match segments of the URL. They are used to **identify a specific resource** or sub‑resource directly in the path (e.g., `/orders/987/items/2`). They promote clean, descriptive URLs and make it clear which resource is being addressed.

## What Is Route Parameter Middleware? (With a Different Example)
**Route parameter middleware** (via `app.param`) is a hook that runs whenever a route with that parameter is matched. It allows you to **centralize validation**, type conversion (e.g., string → number), and normalization so you don’t repeat that logic in every route.

**Example (not part of your tasks):**
```js
app.param("category", (req, res, next, category) => {
  // Normalize category to lowercase letters only
  const norm = String(category).trim().toLowerCase();
  if (!/^[a-z]+$/.test(norm)) {
    return res.status(400).json({ ok: false, error: "Invalid category" });
  }
  req.category = norm;
  next();
});

app.get("/catalog/:category", (req, res) => {
  res.json({ ok: true, category: req.category });
});
```

## Checklist Before You Submit
- [ ] **Server starts** without errors (verify the console log and that a port is listening).
- [ ] **All routes** required by the TODOs exist and return JSON.
- [ ] **Query‑string handling**: Missing/invalid inputs return `400` with a clear JSON error.
- [ ] **Route parameters**: Values are read from `req.params` and used correctly.
- [ ] **Param middleware**: Validation/normalization occurs once; invalid values produce a `400` JSON error.
- [ ] **Status codes** are appropriate (`200` for success, `400` for bad input).
- [ ] **No sensitive data** is logged; console output is minimal and helpful.
- [ ] **Run the quick checks** (provided in the lab instructions) locally and verify expected responses.
- [ ] **Push your code** before the deadline; confirm the GitHub Action runs and artifacts (grade report) are generated.

Good luck, and happy coding!
