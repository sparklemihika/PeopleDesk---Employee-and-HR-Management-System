
# PeopleDesk HR Management System

PeopleDesk is a full-stack HR operations platform built with React, Express, MongoDB and Mongoose. It has separate **HR/admin** and **employee** portals, an analytics dashboard, and workflows for attendance, leave, payroll, recruitment and performance reviews.

## Features

- Executive dashboard with KPIs, charts and people insights
- Employee directory and team management
- Attendance tracking with automatic hours calculation
- Leave requests, approvals, yearly allowances and a team leave calendar
- Payroll creation and processing, with printable employee payslips
- Recruitment pipeline: job openings, candidates, interviews and recruiter notes
- Performance review workflows
- Notifications, audit trail and filtered CSV report exports
- Employee self-service: check-in/out, leave requests, profile-change requests
- Role-based access (admin, HR, employee) with JWT sessions, token revocation, rate limiting and bcrypt password hashing
- Password reset by email (SMTP), light/dark theme, and a built-in support chatbot

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router, Vite, Bootstrap 5, Recharts |
| Backend | Node.js 20.19+/22, Express 5, Helmet, express-rate-limit, compression |
| Database | MongoDB (Atlas or local) via Mongoose |
| Auth | JWT with revocation list, bcrypt, single-use hashed reset tokens |
| Tooling | Node test runner, GitHub Actions CI, Docker, Render Blueprint |

## Project structure

```text
client/src/      React app (pages, components, context, API client)
server/src/      Express API (routes, middleware, models, scripts, utils)
server/test/     Automated tests (npm test)
public/          Static images and favicon
postman/         Postman collection for manual API testing
Dockerfile       Container build (API + built client in one image)
render.yaml      One-click Render Blueprint
```

## Requirements

- Node.js 20.19+ or 22.12+ (an `.nvmrc` is included)
- MongoDB Community Server, or a free MongoDB Atlas cluster

## Quick start

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create your environment file:

   ```sh
   cp .env.example .env
   ```

   Fill in the required values for:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
   - optional `HR_NAME`, `HR_EMAIL`, `HR_PASSWORD`

3. Seed the first admin account:

   ```sh
   npm run seed:admin
   ```

4. Optional: upload the competition demo team and sample records:

   ```sh
   npm run seed:demo
   ```

   This safely creates or updates the demo HR account, four employee records and their portal logins, attendance, leave and balance records, payroll, performance reviews, job openings, candidates, and HR notifications. It does not delete other organization data. Existing account passwords are preserved; newly created employee accounts use `DEMO_EMPLOYEE_PASSWORD` if set, otherwise `Demo-Employee-123`.

5. Optional: create a separate HR account manually:

   ```sh
   npm run create:hr-user
   ```

6. To add 50 more employee profiles with portal logins and sample attendance, leave, payroll, and review data, add `DEMO_EMPLOYEE_01_EMAIL` / `DEMO_EMPLOYEE_01_PASSWORD` through `DEMO_EMPLOYEE_50_EMAIL` / `DEMO_EMPLOYEE_50_PASSWORD` to your ignored local `.env`, then run:

   ```sh
   npm run seed:employees
   ```

   Use unique passwords of at least 12 characters. The seed command adds missing records only; it does not delete employees, overwrite existing profile data, or reset existing account passwords. Keep `.env` private and change demo passwords before using these accounts outside a local demonstration.

7. Start the app:

   ```sh
   npm run dev
   ```

8. Visit:

   - HR portal: `http://localhost:5173/login`
   - Employee portal: `http://localhost:5173/employee-login`

## Demo credentials

After `npm run seed:demo`, the HR account uses the configured `HR_EMAIL` (default `hr@peopledesk.local`) and is displayed as **Mihika Sharma**. Its password is the existing HR password from `.env` (or `Demo-HR-123456` for a new account).

Employee demo accounts:

| Name | Login email |
| --- | --- |
| Dhanveer | `dhanveer@peopledesk.local` |
| Shahjil islam | `shahjil.islam@peopledesk.local` |
| Teerath | `teerath@peopledesk.local` |
| Udit panday | `udit.panday@peopledesk.local` |

Newly created employee accounts use `DEMO_EMPLOYEE_PASSWORD` from `.env` (default: `Demo-Employee-123`); reseeding does not reset existing account passwords. Share credentials individually and change demo passwords before using these accounts outside a local demonstration.

## API overview

Import `postman/PeopleDesk.postman_collection.json` to try the API manually. All routes except health, login and password reset require `Authorization: Bearer <token>`.

### Public and auth endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Returns `200` when the database is connected, otherwise `503` |
| `POST` | `/api/auth/login` | Sign in (`portal` is `hr` or `employee`), rate-limited |
| `POST` | `/api/auth/logout` | Revoke the current token |
| `POST` | `/api/auth/forgot-password` | Request a reset link (generic response, rate-limited) |
| `POST` | `/api/auth/reset-password` | Set a new password with a single-use token |
| `GET` | `/api/auth/me` | Current account |

### HR and admin endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Dashboard metrics and insights |
| `GET`, `POST` | `/api/employees` | List or create employee records |
| `GET`, `POST` | `/api/attendance` | List or record attendance |
| `PATCH` | `/api/attendance/:id/status`, `/api/attendance/:id/checkout` | Update status or check-out time |
| `GET`, `POST` | `/api/leaves` | List or create leave requests |
| `PATCH` | `/api/leaves/:id/status` | Approve or decline leave |
| `GET`, `POST` | `/api/payroll` | List or create payroll records |
| `PATCH` | `/api/payroll/:id/status` | Mark a pending payroll record processed |
| `GET`, `POST` | `/api/candidates` | List or add candidates |
| `PATCH` | `/api/candidates/:id/stage` | Advance a candidate's hiring stage |
| `GET`, `POST` | `/api/performance` | List or create performance reviews |

### Employee portal endpoints

The employee ID always comes from the authenticated account, never from the request.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/employee-portal` | Own profile, attendance, leave, payslips and notifications |
| `POST` | `/api/employee-portal/attendance/check-in` | Check in |
| `PATCH` | `/api/employee-portal/attendance/:id/checkout` | Check out |
| `POST` | `/api/employee-portal/leaves` | Request leave |
| `POST` | `/api/employee-portal/profile-changes` | Request a contact detail change |

### Operations endpoints

These authenticated endpoints use the `/api/operations` prefix. Notifications are available to both portals and scoped to the signed-in account; leave balances, calendar, profile-request review, reports, audit history, and recruitment job management are HR/admin-only.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/operations/notifications` | List the signed-in account's latest notifications |
| `PATCH` | `/api/operations/notifications/:id/read` | Mark one owned notification as read |
| `GET` | `/api/operations/leave-balances?year=2026&department=Engineering` | Review allowance, used, and remaining leave days |
| `PUT` | `/api/operations/leave-balances/:employeeId/:type` | Set a yearly allowance (`year`, `entitlement`) |
| `GET` | `/api/operations/leave-calendar?startDate=2026-01-01&endDate=2026-12-31&department=Engineering` | List approved leave that overlaps the selected range |
| `GET` | `/api/operations/profile-changes` | Review employee contact update requests |
| `PATCH` | `/api/operations/profile-changes/:id/status` | Approve or decline a profile update |
| `GET` | `/api/operations/audit-logs?startDate=2026-01-01&endDate=2026-12-31` | Browse successful authenticated data changes |
| `GET` | `/api/operations/reports?module=attendance&startDate=2026-01-01&endDate=2026-01-31&department=Engineering` | Retrieve a filtered report (`employees`, `attendance`, `leaves`, or `payroll`) |
| `GET` | `/api/operations/reports/export?module=payroll&startDate=2026-01-01&endDate=2026-01-31` | Download a filtered CSV (payroll data is HR-only) |
| `GET`, `POST` | `/api/operations/jobs` | List or create recruitment job openings |
| `PATCH` | `/api/operations/jobs/:id/status` | Open or close a job |
| `PATCH` | `/api/operations/candidates/:id/interview` | Schedule or clear an interview time |
| `PATCH` | `/api/operations/candidates/:id/notes` | Save recruiter notes |

Leave allowances count inclusive calendar days (including weekends); unpaid leave does not consume an allowance. Payroll CSV files contain compensation amounts and must be handled as confidential data. Employee payslips are rendered for printing in the employee's authenticated browser session.

HR creates employee records before an employee login can be provisioned. The employee portal never accepts an employee ID for personal requests; the API takes the employee ID from the authenticated account.

### Password reset email configuration

The **Forgot password?** link is available on both sign-in portals. Configure these variables in `.env` and restart the API before requesting a reset:

| Variable | Description |
| --- | --- |
| `APP_URL` | Public base URL used in reset links, e.g. `http://localhost:5173` locally or the deployed HTTPS origin |
| `DEV_PASSWORD_RESET` | Set to `true` only for local development to show a one-time reset link in the browser when SMTP is not configured. This is disabled in production and only works for requests from the local machine. |
| `SMTP_HOST` | Hostname of your SMTP email provider |
| `SMTP_PORT` | SMTP port, commonly `587` for STARTTLS or `465` for implicit TLS |
| `SMTP_SECURE` | Set to `true` for implicit TLS on port 465; otherwise `false` |
| `SMTP_USER` | SMTP account username |
| `SMTP_PASSWORD` | SMTP password or provider-issued app password |
| `MAIL_FROM` | Verified sender address, e.g. `PeopleDesk <no-reply@example.com>` |

Use credentials from an email provider that permits application SMTP sending, and keep the SMTP password in your environment file or hosting provider secrets. Reset links are single-use, expire after 30 minutes, and are stored only as SHA-256 hashes. Requests are rate-limited and use a generic response to avoid confirming whether an email belongs to an account. For local development without SMTP, set `DEV_PASSWORD_RESET=true`, restart the API, and submit the reset request from `localhost`; the browser will show a local one-time link only when the email and portal match an account. Never enable this option in a deployed environment. In production, configure SMTP instead. A successful password reset invalidates that account's existing sessions; signing out revokes the current JWT.

## Production deployment

This project can be deployed as one Node.js web service: Express serves both the built React app and `/api`. The instructions below use **MongoDB Atlas** for the database and **Render** for hosting. Equivalent Node.js hosting providers can use the same build command, start command, and environment variables. A `render.yaml` Blueprint and a `Dockerfile` are included, so you can also use **New + > Blueprint** on Render, or any container host (Railway, Fly.io, Google Cloud Run, Azure Container Apps). Postman is for API testing; it is not a hosting or deployment service.

### 1. Prepare the source repository

1. Push the project, including `package.json` and `package-lock.json`, to a private GitHub repository.
2. Confirm `.env` is ignored by `.gitignore`. Do not commit passwords, database URIs, JWT secrets, real employee records, or Postman tokens.
3. Use a supported Node version (20.19+ or 22.12+). The Render service can set `NODE_VERSION` to a supported version, for example `22.12.0`.

### 2. Create and secure the MongoDB database

1. Create a MongoDB Atlas project and cluster.
2. In **Database Access**, create a dedicated database user for this application. Give it only the `readWrite` role on the `peopledesk` database. This database user is separate from individual HR and employee application logins.
3. In **Network Access**, allow connections from your hosting provider. Prefer the provider's documented outbound IP addresses or static egress IPs. Only use Atlas's `0.0.0.0/0` rule if the hosting provider offers no stable egress IP, and then use a strong, unique database password and the least-privilege database role.
4. Copy the Atlas driver connection string and replace the placeholders:

   ```text
   mongodb+srv://<database-user>:<url-encoded-database-password>@<cluster-host>/peopledesk?retryWrites=true&w=majority
   ```

   URL-encode special characters in the database username or password. Keep this URI private; it is a server-side secret, not a browser/Vite variable.

### 3. Deploy the web service

1. In Render, create a **Web Service** connected to the GitHub repository and select the production branch.
2. Configure:

   | Setting | Value |
   | --- | --- |
   | Runtime | Node |
   | Build command | `npm install && npm run build` |
   | Start command | `npm start` |
   | Health-check path | `/api/health` |

   The build generates the React app in `dist`. The Express server serves that build and handles the API in the same service.
3. Add these environment variables in the hosting service's environment settings:

   | Variable | Production value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22.12.0` or another supported Node version |
   | `MONGODB_URI` | The private Atlas URI from step 2 |
   | `JWT_SECRET` | A new, randomly generated secret with at least 32 characters |
   | `JWT_EXPIRES_IN` | `8h`, or your chosen session lifetime |
   | `TRUST_PROXY` | Optional. Defaults to `1` in production, which is correct for Render and most platforms. Needed so login rate limits apply per visitor instead of to the proxy. |
   | `CLIENT_ORIGIN` | The exact deployed site origin, e.g. `https://your-service.onrender.com` |
   | `APP_URL` | The exact deployed site origin, e.g. `https://your-service.onrender.com` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Your SMTP provider's connection settings |
   | `SMTP_USER`, `SMTP_PASSWORD` | Private SMTP credentials stored as host secrets |
   | `MAIL_FROM` | A sender address verified by your email provider |

   Generate a JWT secret locally with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Do not add a `VITE_` prefix to database credentials or JWT secrets; these values must remain on the server. Render provides `PORT` automatically, so do not hard-code it.
4. Deploy the service and wait for the build and startup to finish. Visit `https://your-service.onrender.com/api/health`; a successful deployment returns HTTP `200` with `{"status":"ok","database":"connected"}`. If it returns `503`, check the Render service logs, `MONGODB_URI`, and the Atlas network access rules.

### 4. Provision individual HR and employee accounts

There is no public account-registration endpoint. Provision accounts only after the deployed service can connect to MongoDB.

1. Run the provisioning scripts **from your own computer** against the production database (this works on every hosting plan, including ones without a shell). Environment variables set on the command line override your local `.env`:

   ```sh
   MONGODB_URI="<your Atlas URI>" ADMIN_NAME="Your Name" ADMIN_EMAIL="you@company.com" ADMIN_PASSWORD="<12+ char unique password>" npm run seed:admin
   ```

   (On Windows PowerShell, set each variable with `$env:NAME="value"` before running the command.) This creates the initial administrator; its password is hashed with bcrypt. The seed command intentionally stops if an account with that email already exists. If your host does provide a shell, you can run the same command there instead.
2. If you need a separate HR account, pass `HR_NAME`, `HR_EMAIL` and `HR_PASSWORD` the same way (together with `MONGODB_URI`) and run:

   ```sh
   npm run create:hr-user
   ```

   HR users sign in at `https://your-service.onrender.com/login`.
3. Sign in as HR and create an employee record. For each employee who needs individual portal access, pass `EMPLOYEE_EMAIL` (the employee record's email) and `EMPLOYEE_PASSWORD` (unique, at least 12 characters) the same way, together with `MONGODB_URI`, and run:

   ```sh
   npm run create:employee-user
   ```

   Repeat for each employee with their own email and password. Give credentials to the employee through a secure channel, not a source file, public issue, or chat room. Employees sign in at `https://your-service.onrender.com/employee-login`.
4. Record the service URL and share it with users. The same URL serves the HR portal, the employee portal, and the API.

### 5. Verify the deployed application

1. Sign in using the administrator credentials and confirm the HR dashboard loads.
2. Create an employee record, then provision and test its individual employee login.
3. Confirm the employee portal shows only the signed-in employee's own records. Check that the HR account cannot sign in through the employee portal and that the employee account cannot access HR routes.
4. Import [`postman/PeopleDesk.postman_collection.json`](./postman/PeopleDesk.postman_collection.json) into Postman. Set `baseUrl` to the deployed service URL. Sign in using the HR login request (`portal: "hr"`) to test HR endpoints; use the employee login request (`portal: "employee"`) to test the employee portal endpoints.
5. Review the hosting logs and Atlas metrics for connection errors. Do not copy tokens or passwords into shared Postman workspaces.
6. Test **Forgot password?** on both portal sign-in screens and verify the reset email link uses the deployed `APP_URL`.

### Ongoing security and operations

- Keep the Atlas database password, `JWT_SECRET`, and account passwords in the hosting provider's secret environment settings, not in Git or frontend configuration.
- Serve production access over HTTPS. Restrict Atlas network access and keep the application database user limited to the `peopledesk` database.
- Use a unique password for every account. Never share HR or employee credentials.
- Back up the Atlas database and test restoring a backup before relying on it for business records.
- Rotate credentials if they are exposed. Rotating `JWT_SECRET` invalidates existing login tokens, so users must sign in again.
- When changing the application, push to the connected branch and verify the new deployment and `/api/health` response before sharing it.

## Testing and CI

```sh
npm test          # unit and API tests (no database required)
npm run build     # production client build into dist/
```

GitHub Actions (`.github/workflows/ci.yml`) runs the tests, the build and a dependency audit on every push and pull request.

## Run with Docker

```sh
docker build -t peopledesk .
docker run -p 5000:5000 --env-file .env -e NODE_ENV=production -e MONGODB_URI="<atlas-uri>" peopledesk
```

The image serves the API and the built React app on port 5000 and includes a health check.

## License

Created for educational and demo purposes.

# PeopleDesk---Employee-and-HR-Management-System
