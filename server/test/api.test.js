import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import { requireRole } from "../src/middleware/auth.js";

test("health reports database readiness and protected portals require authentication", async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: "unavailable", database: "disconnected" });

  const employees = await fetch(`${baseUrl}/api/employees`);
  assert.equal(employees.status, 401);
  assert.deepEqual(await employees.json(), { message: "Authentication is required." });

  const employeePortal = await fetch(`${baseUrl}/api/employee-portal`);
  assert.equal(employeePortal.status, 401);
  assert.deepEqual(await employeePortal.json(), { message: "Authentication is required." });

  const supportRequest = await fetch(`${baseUrl}/api/employee-portal/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: "Help", message: "I need assistance." }),
  });
  assert.equal(supportRequest.status, 401);
  assert.deepEqual(await supportRequest.json(), { message: "Authentication is required." });

  const operations = await fetch(`${baseUrl}/api/operations/notifications`);
  assert.equal(operations.status, 401);
  assert.deepEqual(await operations.json(), { message: "Authentication is required." });

  const collaboration = await fetch(`${baseUrl}/api/collaboration`);
  assert.equal(collaboration.status, 401);
  assert.deepEqual(await collaboration.json(), { message: "Authentication is required." });

  const externalCollaboration = await fetch(`${baseUrl}/api/external-collaboration`);
  assert.equal(externalCollaboration.status, 401);
  assert.deepEqual(await externalCollaboration.json(), { message: "Authentication is required." });

  const collaborationWrites = [
    ["POST", "/api/collaboration/tasks"],
    ["POST", "/api/collaboration/tasks/507f1f77bcf86cd799439011/comments"],
    ["POST", "/api/collaboration/onboarding"],
    ["PATCH", "/api/collaboration/onboarding/507f1f77bcf86cd799439011/items/507f1f77bcf86cd799439012"],
  ];
  for (const [method, path] of collaborationWrites) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Authentication is required." });
  }

  const externalProjectCreate = await fetch(`${baseUrl}/api/external-collaboration/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(externalProjectCreate.status, 401);
  assert.deepEqual(await externalProjectCreate.json(), { message: "Authentication is required." });

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
  assert.equal(logout.status, 401);

  const invalidPortal = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com", portal: "invalid" }),
  });
  assert.equal(invalidPortal.status, 400);

  const invalidReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "expired-or-invalid", password: "A-long-enough-password-123" }),
  });
  assert.equal(invalidReset.status, 400);

  const invalidPartnerInvite = await fetch(`${baseUrl}/api/auth/accept-partner-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "invalid", name: "Guest", password: "A-long-enough-password-123" }),
  });
  assert.equal(invalidPartnerInvite.status, 400);
});

test("role guards keep employee and HR areas separate", () => {
  function invokeRole(role, allowedRoles) {
    let nextCalled = false;
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    requireRole(...allowedRoles)({ user: { role } }, response, () => { nextCalled = true; });
    return { response, nextCalled };
  }

  assert.equal(invokeRole("employee", ["admin", "hr"]).response.statusCode, 403);
  assert.equal(invokeRole("hr", ["employee"]).response.statusCode, 403);
  assert.equal(invokeRole("partner", ["admin", "hr", "employee"]).response.statusCode, 403);
  assert.equal(invokeRole("employee", ["employee"]).nextCalled, true);
  assert.equal(invokeRole("admin", ["admin", "hr"]).nextCalled, true);
});
