import { useCallback, useEffect, useState } from "react";
import { api, downloadFile } from "../lib/api.js";

const projectSections = [
  { id: "tasks", label: "Tasks" },
  { id: "meetings", label: "Meetings" },
  { id: "updates", label: "Updates" },
  { id: "files", label: "Files" },
  { id: "activity", label: "Activity" },
  { id: "members", label: "People" },
];

function showDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function ExternalCollaboration({ user, fullPage = false }) {
  const [open, setOpen] = useState(fullPage);
  const [projects, setProjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [organizationName, setOrganizationName] = useState("PeopleDesk");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [detail, setDetail] = useState(null);
  const [view, setView] = useState("projects");
  const [section, setSection] = useState("tasks");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const canCreate = user?.role === "admin" || user?.role === "hr";

  const loadProjects = useCallback(async () => {
    const result = await api("/external-collaboration");
    const available = result.data || [];
    setProjects(available);
    setRequests(result.requests || []);
    setInvitations(result.invitations || []);
    setOrganizationName(result.organizationName || "PeopleDesk");
    setSelectedProjectId((current) => available.some((item) => item._id === current) ? current : available[0]?._id || "");
    return available;
  }, []);

  const loadDetail = useCallback(async (projectId) => {
    if (!projectId) {
      setDetail(null);
      return;
    }
    const result = await api(`/external-collaboration/projects/${projectId}`);
    setDetail(result.data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadProjects();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (selectedProjectId && open) {
      loadDetail(selectedProjectId).catch((requestError) => setError(requestError.message));
    } else {
      setDetail(null);
    }
  }, [loadDetail, open, selectedProjectId]);

  const selectedProject = projects.find((project) => project._id === selectedProjectId) || null;

  async function submitJson(event, endpoint, onSuccess) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const result = await api(endpoint, { method: "POST", body: JSON.stringify(values) });
      form.reset();
      await onSuccess?.(result);
      if (!onSuccess && selectedProject) await loadDetail(selectedProject._id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function createProject(event) {
    await submitJson(event, "/external-collaboration/projects", async (result) => {
      setInviteUrl(result.invitation?.url || "");
      setMessage(result.invitation?.emailSent
        ? `Project created and invitation emailed to ${result.invitation.email}.`
        : `Project created. Copy the invitation link to share with ${result.invitation?.email || "your partner"}.`);
      await loadProjects();
      setSelectedProjectId(result.data._id);
      await loadDetail(result.data._id);
    });
  }

  async function createInvite(event) {
    await submitJson(event, `/external-collaboration/projects/${selectedProject._id}/invites`, async (result) => {
      setInviteUrl(result.invitation.url);
      setMessage(result.invitation.emailSent
        ? `Invitation emailed to ${result.invitation.email}.`
        : `Copy this link to invite ${result.invitation.email}.`);
    });
  }

  async function submitTask(event) {
    await submitJson(event, `/external-collaboration/projects/${selectedProject._id}/tasks`);
  }

  async function submitMeeting(event) {
    await submitJson(event, `/external-collaboration/projects/${selectedProject._id}/meetings`);
  }

  async function submitUpdate(event) {
    await submitJson(event, `/external-collaboration/projects/${selectedProject._id}/announcements`);
  }

  async function addInternalMember(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    try {
      await api(`/external-collaboration/projects/${selectedProject._id}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: new FormData(form).get("userId") }),
      });
      form.reset();
      await loadDetail(selectedProject._id);
      setMessage("Teammate added to the shared project.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendCompanyRequest(event) {
    await submitJson(event, "/external-collaboration/requests", async () => {
      await loadProjects();
      setMessage(`Your proposal was sent to ${organizationName}. You’ll see the response here and get a notification.`);
    });
  }

  async function respondToRequest(request, decision) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api(`/external-collaboration/requests/${request._id}/respond`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      await loadProjects();
      setMessage(decision === "Accepted"
        ? `Accepted ${request.partnerOrganization?.name || "the company"}’s proposal. The shared project is ready.`
        : `Declined ${request.partnerOrganization?.name || "the company"}’s proposal.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(task, status) {
    setError("");
    try {
      await api(`/external-collaboration/projects/${selectedProject._id}/tasks/${task._id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadDetail(selectedProject._id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function addComment(event, task) {
    await submitJson(event, `/external-collaboration/projects/${selectedProject._id}/tasks/${task._id}/comments`);
  }

  async function uploadFile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) return;
    setSaving(true);
    setError("");
    try {
      await api(`/external-collaboration/projects/${selectedProject._id}/files`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      form.reset();
      await loadDetail(selectedProject._id);
      setMessage("File shared with project members.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("Invitation link copied.");
    } catch {
      setMessage("Select and copy the invitation link below.");
    }
  }

  const selectedMemberIds = new Set((detail?.members || []).map(({ user: member }) => String(member?._id)));
  const isHost = user?.role === "admin" || user?.role === "hr";
  const projectBody = (
    <div className="external-project-layout">
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      {message && <div className="alert alert-success py-2" role="status">{message}</div>}
      <nav className="collab-tabs external-project-tabs" aria-label="Partner workspace sections">
        <button type="button" className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}>Projects</button>
        <button type="button" className={view === "invitations" ? "active" : ""} onClick={() => setView("invitations")}>Invitations &amp; requests{isHost && requests.some(({ status }) => status === "Pending") ? ` (${requests.filter(({ status }) => status === "Pending").length})` : ""}</button>
      </nav>
      {view === "projects" && <>
        {inviteUrl && <div className="external-invite-link"><label htmlFor="external-invite-url">Partner invitation link</label><div><input id="external-invite-url" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} /><button type="button" className="collab-primary-button" onClick={copyInvite}>Copy link</button></div></div>}
        <div className="external-project-picker">
          <label htmlFor="external-project-select">Partner project</label>
          <select id="external-project-select" value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value="">Choose a project</option>
            {projects.map((project) => <option key={project._id} value={project._id}>{project.name} · {project.partnerOrganization?.name}</option>)}
          </select>
        </div>
        {!loading && !projects.length && <div className="collab-empty">{canCreate ? "No partner projects yet. Start one from Invitations & requests." : "You have not been added to any partner projects yet."}</div>}
        {loading && !detail && <div className="collab-empty">Loading partner projects…</div>}
      {detail && <>
        <section className="external-project-summary">
          <span className="collab-eyebrow">SHARED PROJECT · {detail.project.partnerOrganization?.name}</span>
          <h3>{detail.project.name}</h3>
          {detail.project.description && <p>{detail.project.description}</p>}
        </section>
        <nav className="collab-tabs external-project-tabs" aria-label="Partner project sections">
          {projectSections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>{item.label}</button>)}
        </nav>
        {section === "tasks" && <>
          <form className="collab-form external-project-form" onSubmit={submitTask}>
            <h3>Add a shared task</h3>
            <div className="collab-form-grid">
              <label>Task<input name="title" required maxLength="160" /></label>
              <label>Assign to<select name="assigneeId" defaultValue=""><option value="">Unassigned</option>{detail.members.map(({ user: member }) => member && <option key={member._id} value={member._id}>{member.name}</option>)}</select></label>
              <label className="wide">Details<input name="description" maxLength="2000" /></label>
              <label>Due date<input name="dueDate" type="date" /></label>
            </div>
            <button type="submit" className="collab-primary-button" disabled={saving}>{saving ? "Adding…" : "Add task"}</button>
          </form>
          <div className="collab-record-list">{detail.tasks.map((task) => {
            const comments = detail.comments.filter((comment) => String(comment.task) === task._id);
            return <article className="collab-record external-project-task" key={task._id}>
              <div className="collab-record-top"><div><h3>{task.title}</h3><small>{task.assignee?.name ? `Assigned to ${task.assignee.name}` : "Unassigned"} · Due {task.dueDate ? showDate(task.dueDate) : "No due date"}</small></div>
                <select aria-label={`Update ${task.title} status`} value={task.status} disabled={!detail.canManage && task.assignee?._id !== user?.id} onChange={(event) => updateTask(task, event.target.value)}><option>To do</option><option>In progress</option><option>Done</option></select>
              </div>
              {task.description && <p>{task.description}</p>}
              <div className="external-task-comments"><strong>Updates ({comments.length})</strong>{comments.map((comment) => <p key={comment._id}><b>{comment.author?.name || "Project member"}:</b> {comment.body}</p>)}
                <form className="external-comment-form" onSubmit={(event) => addComment(event, task)}><input name="body" required maxLength="2000" placeholder="Write a project update…" /><button type="submit" className="collab-primary-button" disabled={saving}>Comment</button></form>
              </div>
            </article>;
          })}{!detail.tasks.length && <div className="collab-empty">No shared tasks yet.</div>}</div>
        </>}
        {section === "meetings" && <>
          <form className="collab-form external-project-form" onSubmit={submitMeeting}>
            <h3>Share meeting minutes</h3>
            <div className="collab-form-grid"><label>Meeting title<input name="title" required maxLength="160" /></label><label>Date<input name="date" type="date" required /></label><label className="wide">Minutes<textarea name="notes" rows="3" required maxLength="5000" /></label><label className="wide">Action items<textarea name="actionItems" rows="2" maxLength="3000" /></label></div>
            <button type="submit" className="collab-primary-button" disabled={saving}>Save minutes</button>
          </form>
          <div className="collab-record-list">{detail.meetings.map((meeting) => <article className="collab-record" key={meeting._id}><h3>{meeting.title}</h3><small>{showDate(meeting.date)} · {meeting.createdBy?.name}</small><p>{meeting.notes}</p>{meeting.actionItems && <p><strong>Action items:</strong> {meeting.actionItems}</p>}</article>)}{!detail.meetings.length && <div className="collab-empty">No meeting minutes yet.</div>}</div>
        </>}
        {section === "updates" && <>
          <form className="collab-form external-project-form" onSubmit={submitUpdate}>
            <h3>Post a project update</h3><div className="collab-form-grid"><label>Title<input name="title" required maxLength="160" /></label><label className="wide">Update<textarea name="message" rows="3" required maxLength="2000" /></label></div>
            <button type="submit" className="collab-primary-button" disabled={saving}>Post update</button>
          </form>
          <div className="collab-record-list">{detail.announcements.map((item) => <article className="collab-record" key={item._id}><h3>{item.title}</h3><small>{item.createdBy?.name} · {showDate(item.createdAt)}</small><p>{item.message}</p></article>)}{!detail.announcements.length && <div className="collab-empty">No project updates yet.</div>}</div>
        </>}
        {section === "files" && <>
          <form className="collab-form external-project-form" onSubmit={uploadFile}>
            <h3>Share a project file</h3><p>PDF, PNG, JPEG, WebP, CSV, or text files up to 10 MB each (100 MB total per project).</p>
            <label className="external-file-picker">Choose a file<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain" /></label>
            <button type="submit" className="collab-primary-button" disabled={saving}>{saving ? "Uploading…" : "Upload file"}</button>
          </form>
          <div className="collab-record-list">{detail.files.map((file) => <article className="collab-record external-file-row" key={file._id}><div><strong>{file.filename}</strong><small>{(file.length / 1024).toFixed(0)} KB · shared by {file.uploadedBy} · {showDate(file.uploadedAt)}</small></div><button type="button" className="collab-primary-button" onClick={() => downloadFile(`/external-collaboration/projects/${selectedProject._id}/files/${file._id}`, file.filename).catch((requestError) => setError(requestError.message))}>Download</button></article>)}{!detail.files.length && <div className="collab-empty">No shared files yet.</div>}</div>
        </>}
        {section === "activity" && <div className="collab-record-list">{detail.activity.map((item) => <article className="collab-record external-activity-item" key={item._id}><div className="collab-record-top"><div><h3>{item.title}</h3><small>{item.taskTitle} · {showDate(item.createdAt)}</small></div><span className="external-activity-kind">{item.kind === "comment" ? "Comment" : "Task"}</span></div><p>{item.message}</p></article>)}{!detail.activity.length && <div className="collab-empty">Project activity will appear here as your team works together.</div>}</div>}
        {section === "members" && <>
          {detail.canManage && <><form className="collab-form external-project-form external-invite-form" onSubmit={createInvite}><h3>Invite another partner</h3><label>Partner email<input name="email" required type="email" maxLength="254" placeholder="colleague@partner.com" /></label><button type="submit" className="collab-primary-button" disabled={saving}>Send invitation</button></form>
            {detail.employees.length > 0 && <form className="collab-form external-project-form external-invite-form" onSubmit={addInternalMember}><h3>Add your teammate</h3><label>Employee<select name="userId" required defaultValue=""><option value="" disabled>Choose an employee</option>{detail.employees.filter((employee) => !selectedMemberIds.has(String(employee._id))).map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.email}</option>)}</select></label><button type="submit" className="collab-primary-button" disabled={saving}>Add teammate</button></form>}
          </>}
          <div className="collab-record-list">{detail.members.map(({ user: member, kind }) => member && <article className="collab-record external-file-row" key={member._id}><div><strong>{member.name}</strong><small>{member.email} · {kind === "partner" ? "Partner organization" : "Your organization"}</small></div></article>)}</div>
        </>}
      </>}
      </>}
      {view === "invitations" && <>
        {canCreate && <form className="collab-form external-project-form" onSubmit={createProject}>
          <h3>Invite a company to collaborate</h3>
          <p>Send a private, project-specific invitation. Only invited people can see the shared project.</p>
          <div className="collab-form-grid">
            <label>Project name<input name="name" required maxLength="160" placeholder="Product launch partnership" /></label>
            <label>Company name<input name="partnerName" required maxLength="160" placeholder="Partner company" /></label>
            <label>Company contact email<input name="email" type="email" required maxLength="254" placeholder="name@partner.com" /></label>
            <label className="wide">Invitation message<textarea name="description" rows="2" maxLength="2000" placeholder="Shared goals and context" /></label>
          </div>
          <button className="collab-primary-button" type="submit" disabled={saving}>{saving ? "Sending…" : "Send collaboration invitation"}</button>
        </form>}
        {user?.role === "partner" && <form className="collab-form external-project-form" onSubmit={sendCompanyRequest}>
          <h3>Request collaboration with {organizationName}</h3>
          <p>Tell our HR team what you’d like to work on. They’ll review your proposal and notify you of their decision.</p>
          <div className="collab-form-grid"><label>Proposed project<input name="projectName" required maxLength="160" placeholder="Joint customer research" /></label><label className="wide">Your proposal<textarea name="message" rows="3" required maxLength="2000" placeholder="Goals, timeline, and how both teams can contribute" /></label></div>
          <button className="collab-primary-button" type="submit" disabled={saving}>{saving ? "Sending…" : "Send company request"}</button>
        </form>}
        {isHost && <section className="external-request-section"><h3>Incoming company requests</h3>
          <div className="collab-record-list">{requests.map((request) => <article className="collab-record" key={request._id}>
            <div className="collab-record-top"><div><h3>{request.projectName}</h3><small>{request.partnerOrganization?.name} · From {request.fromUser?.name} ({request.fromUser?.email}) · {showDate(request.createdAt)}</small></div><span className={`external-request-status ${request.status.toLowerCase()}`}>{request.status}</span></div>
            <p>{request.message}</p>
            {request.responseMessage && <p><strong>Response:</strong> {request.responseMessage}</p>}
            {request.status === "Pending" && <div className="external-request-actions"><button type="button" className="collab-primary-button" disabled={saving} onClick={() => respondToRequest(request, "Accepted")}>Accept &amp; create project</button><button type="button" className="external-decline-button" disabled={saving} onClick={() => respondToRequest(request, "Declined")}>Decline</button></div>}
            {request.project && <small className="external-created-project">Shared project: {request.project.name}</small>}
          </article>)}{!requests.length && <div className="collab-empty">No company requests have arrived yet.</div>}</div>
        </section>}
        {isHost && <section className="external-request-section"><h3>Sent company invitations</h3>
          <div className="collab-record-list">{invitations.map((invite) => {
            const expired = invite.status === "Pending" && new Date(invite.expiresAt) <= new Date();
            const status = invite.status === "Accepted" ? "Accepted" : expired ? "Expired" : invite.status;
            return <article className="collab-record external-file-row" key={invite._id}><div><strong>{invite.email}</strong><small>{invite.project?.name || "Project"} · Invited by {invite.invitedBy?.name || "HR"} · {showDate(invite.createdAt)}</small></div><span className={`external-request-status ${status.toLowerCase()}`}>{status}</span></article>;
          })}{!invitations.length && <div className="collab-empty">No company invitations sent yet.</div>}</div>
        </section>}
        {user?.role === "partner" && <section className="external-request-section"><h3>Your company requests</h3>
          <div className="collab-record-list">{requests.map((request) => <article className="collab-record" key={request._id}><div className="collab-record-top"><div><h3>{request.projectName}</h3><small>Sent {showDate(request.createdAt)} · {organizationName}</small></div><span className={`external-request-status ${request.status.toLowerCase()}`}>{request.status}</span></div><p>{request.message}</p>{request.responseMessage && <p><strong>Response:</strong> {request.responseMessage}</p>}{request.project && <small className="external-created-project">Open it in your Projects tab.</small>}</article>)}{!requests.length && <div className="collab-empty">You haven’t sent a collaboration request yet.</div>}</div>
        </section>}
        {!isHost && user?.role !== "partner" && <div className="collab-empty">HR reviews company invitations and requests. Ask HR to add you to a shared project.</div>}
      </>}
    </div>
  );

  if (fullPage) return <main className="external-full-page"><header><div><span className="collab-eyebrow">PEOPLEDESK PARTNER SPACE</span><h1>Partner projects</h1><p>Shared plans with your invited organizations.</p></div></header>{projectBody}</main>;
  return <><button className="external-collab-launcher" type="button" onClick={() => setOpen(true)}><span aria-hidden="true">↗</span> Partner projects</button>{open && <div className="collab-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}><section className="collab-window external-collab-window" role="dialog" aria-modal="true" aria-labelledby="external-collab-title"><header className="collab-header"><div><span className="collab-eyebrow">INVITE-ONLY SHARED WORK</span><h2 id="external-collab-title">Partner projects</h2><p>Work together without opening your internal workspace.</p></div><button type="button" className="collab-close" onClick={() => setOpen(false)} aria-label="Close partner projects">×</button></header><div className="collab-content">{projectBody}</div></section></div>}</>;
}
