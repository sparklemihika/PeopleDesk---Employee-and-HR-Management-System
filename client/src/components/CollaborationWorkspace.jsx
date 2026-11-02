import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";

const sections = [
  { id: "meetings", label: "Meeting minutes" },
  { id: "todos", label: "To-do list" },
  { id: "tasks", label: "Assigned work" },
  { id: "onboarding", label: "Onboarding" },
  { id: "announcements", label: "Updates" },
];

function displayCalendarDate(value) {
  if (!value) return "No due date";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleDateString();
}

function displayTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function localDateInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function monthDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function CollaborationWorkspace({ user }) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("meetings");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [taskView, setTaskView] = useState("list");
  const [taskStatusFilter, setTaskStatusFilter] = useState("All");
  const [taskEmployeeFilter, setTaskEmployeeFilter] = useState("All");
  const [taskDateFilter, setTaskDateFilter] = useState("any");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [commentDrafts, setCommentDrafts] = useState({});
  const canManage = user?.role !== "employee";

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api("/collaboration"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadWorkspace();
  }, [open, loadWorkspace]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !saving) setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, saving]);

  async function submitForm(event, path) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    try {
      await api(`/collaboration/${path}`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      form.reset();
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateTodo(todo) {
    setError("");
    try {
      const result = await api(`/collaboration/todos/${todo._id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !todo.completed }),
      });
      setData((current) => ({ ...current, todos: current.todos.map((item) => item._id === todo._id ? result.data : item) }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateTask(task, status) {
    setError("");
    try {
      const result = await api(`/collaboration/tasks/${task._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setData((current) => ({ ...current, tasks: current.tasks.map((item) => item._id === task._id ? result.data : item) }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function submitTaskComment(event, task) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") || "").trim();
    const mentions = (data?.mentionUsers || [])
      .filter((person) => body.toLocaleLowerCase().includes(`@${person.name.toLocaleLowerCase()}`))
      .map((person) => person._id);
    setSaving(true);
    setError("");
    try {
      const result = await api(`/collaboration/tasks/${task._id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, mentions }),
      });
      setData((current) => ({ ...current, comments: [...current.comments, result.data] }));
      setCommentDrafts((current) => ({ ...current, [task._id]: "" }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function addMention(taskId, userId) {
    const person = data?.mentionUsers.find((item) => item._id === userId);
    if (!person) return;
    setCommentDrafts((current) => {
      const existing = current[taskId] || "";
      return { ...current, [taskId]: `${existing}${existing && !existing.endsWith(" ") ? " " : ""}@${person.name} ` };
    });
  }

  async function updateOnboardingItem(checklist, item) {
    setError("");
    try {
      const result = await api(`/collaboration/onboarding/${checklist._id}/items/${item._id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !item.completed }),
      });
      setData((current) => ({ ...current, onboarding: current.onboarding.map((entry) => entry._id === checklist._id ? result.data : entry) }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function submitOnboarding(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const items = String(formData.get("itemsText") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    setSaving(true);
    setError("");
    try {
      await api("/collaboration/onboarding", {
        method: "POST",
        body: JSON.stringify({
          employeeId: formData.get("employeeId"),
          title: formData.get("title"),
          items,
        }),
      });
      form.reset();
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const todayKey = dateKey(new Date());
  const filteredTasks = (data?.tasks || []).filter((task) => {
    const dueKey = task.dueDate ? dateKey(task.dueDate) : "";
    if (taskStatusFilter !== "All" && task.status !== taskStatusFilter) return false;
    if (canManage && taskEmployeeFilter !== "All" && task.assignedEmployee?._id !== taskEmployeeFilter) return false;
    if (taskDateFilter === "overdue" && (!dueKey || dueKey >= todayKey || task.status === "Done")) return false;
    if (taskDateFilter === "next7") {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      if (!dueKey || dueKey < todayKey || dueKey > dateKey(nextWeek)) return false;
    }
    return true;
  });
  const monthYear = calendarMonth.getFullYear();
  const monthNumber = calendarMonth.getMonth();
  const monthDayCount = new Date(monthYear, monthNumber + 1, 0).getDate();
  const monthOffset = (new Date(monthYear, monthNumber, 1).getDay() + 6) % 7;
  const calendarCells = [
    ...Array.from({ length: monthOffset }, () => null),
    ...Array.from({ length: monthDayCount }, (_, index) => index + 1),
  ];

  return (
    <>
      <button className="collab-launcher" type="button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">✳</span> Collaborate
      </button>
      {open && <div className="collab-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
        <section className="collab-window" role="dialog" aria-modal="true" aria-labelledby="collab-title">
          <header className="collab-header">
            <img className="collab-header-image" src="/collaboration-hero.svg" alt="" aria-hidden="true" />
            <div><span className="collab-eyebrow">YOUR ORGANIZATION</span><h2 id="collab-title">Collaborate</h2><p>Meetings, shared plans, and team work in one place.</p></div>
            <button type="button" className="collab-close" onClick={() => setOpen(false)} aria-label="Close collaboration workspace">×</button>
          </header>
          <nav className="collab-tabs" aria-label="Collaboration sections">
            {sections.map((section) => <button key={section.id} type="button" className={activeSection === section.id ? "active" : ""} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}
          </nav>
          <div className="collab-content">
            {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
            {loading && !data ? <div className="collab-empty">Loading organization workspace…</div> : null}
            {data && activeSection === "meetings" && <>
              {canManage && <form className="collab-form" onSubmit={(event) => submitForm(event, "meetings")}>
                <h3>Record meeting minutes</h3>
                <div className="collab-form-grid">
                  <label>Meeting title<input name="title" required maxLength="160" placeholder="Weekly team sync" /></label>
                  <label>Date<input name="date" type="date" required defaultValue={localDateInputValue()} /></label>
                  <label className="wide">Attendees<input name="attendees" maxLength="2000" placeholder="Names separated by commas" /></label>
                  <label className="wide">Minutes<textarea name="notes" required maxLength="5000" rows="3" placeholder="Discussion, decisions, and context" /></label>
                  <label className="wide">Action items<textarea name="actionItems" maxLength="3000" rows="2" placeholder="Next steps and owners" /></label>
                </div>
                <button className="collab-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save minutes"}</button>
              </form>}
              <div className="collab-record-list">{data.meetings.map((meeting) => <article className="collab-record" key={meeting._id}>
                <div className="collab-record-top"><div><h3>{meeting.title}</h3><small>{displayCalendarDate(meeting.date)} · Added by {meeting.createdBy?.name || "Team"}</small></div><span className="collab-date-chip">{displayCalendarDate(meeting.date)}</span></div>
                {meeting.attendees && <p><strong>Attendees:</strong> {meeting.attendees}</p>}
                <p className="collab-record-body">{meeting.notes}</p>
                {meeting.actionItems && <p className="collab-action-items"><strong>Action items</strong><br />{meeting.actionItems}</p>}
              </article>)}{!data.meetings.length && <div className="collab-empty">No meeting minutes yet.</div>}</div>
            </>}
            {data && activeSection === "todos" && <>
              <form className="collab-form collab-inline-form" onSubmit={(event) => submitForm(event, "todos")}>
                <h3>Add to the shared to-do list</h3>
                <div className="collab-form-grid"><label>To-do item<input name="title" required maxLength="160" placeholder="What should the team do?" /></label><label>Details<input name="description" maxLength="1000" placeholder="Optional details" /></label></div>
                <button className="collab-primary-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add to-do"}</button>
              </form>
              <div className="collab-todo-list">{data.todos.map((todo) => <label className={`collab-todo ${todo.completed ? "completed" : ""}`} key={todo._id}>
                <input type="checkbox" checked={todo.completed} onChange={() => updateTodo(todo)} />
                <span><strong>{todo.title}</strong>{todo.description && <small>{todo.description}</small>}<small>Added by {todo.createdBy?.name || "Team"}</small></span>
              </label>)}{!data.todos.length && <div className="collab-empty">The shared list is clear. Add the first to-do.</div>}</div>
            </>}
            {data && activeSection === "tasks" && <>
              {canManage && <form className="collab-form collab-inline-form" onSubmit={(event) => submitForm(event, "tasks")}>
                <h3>Assign work</h3>
                <div className="collab-form-grid">
                  <label>Task<input name="title" required maxLength="160" placeholder="Prepare the monthly report" /></label>
                  <label>Assign to<select name="employeeId" required defaultValue=""><option value="" disabled>Choose an employee</option>{data.employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.department}</option>)}</select></label>
                  <label className="wide">Details<input name="description" maxLength="1000" placeholder="Optional task details" /></label>
                  <label>Due date<input name="dueDate" type="date" /></label>
                </div>
                <button className="collab-primary-button" type="submit" disabled={saving || !data.employees.length}>{saving ? "Assigning…" : "Assign task"}</button>
                {!data.employees.length && <small className="collab-form-hint">Create an employee portal account before assigning work.</small>}
              </form>}
              <div className="collab-task-toolbar">
                <div className="collab-view-switch"><button type="button" className={taskView === "list" ? "active" : ""} onClick={() => setTaskView("list")}>List</button><button type="button" className={taskView === "calendar" ? "active" : ""} onClick={() => setTaskView("calendar")}>Calendar</button></div>
                <label>Status<select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}><option>All</option><option>To do</option><option>In progress</option><option>Done</option></select></label>
                {canManage && <label>Assignee<select value={taskEmployeeFilter} onChange={(event) => setTaskEmployeeFilter(event.target.value)}><option value="All">Everyone</option>{data.employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>}
                <label>Due date<select value={taskDateFilter} onChange={(event) => setTaskDateFilter(event.target.value)}><option value="any">Any date</option><option value="next7">Next 7 days</option><option value="overdue">Overdue</option></select></label>
              </div>
              {taskView === "list" ? <div className="collab-record-list">{filteredTasks.map((task) => {
                const taskComments = data.comments.filter((comment) => String(comment.task) === task._id);
                return <article className="collab-task collab-task-thread" key={task._id}>
                  <div className="collab-task-main">
                    <div className="collab-task-copy"><h3>{task.title}</h3><p>{task.description || "No extra details"}</p><small>{canManage ? `Assigned to ${task.assignedEmployee?.name || "Employee"}` : `Assigned by ${task.assignedBy?.name || "HR"}`} · Due {displayCalendarDate(task.dueDate)}</small></div>
                    <select aria-label={`Update status for ${task.title}`} value={task.status} onChange={(event) => updateTask(task, event.target.value)}>
                      <option>To do</option><option>In progress</option><option>Done</option>
                    </select>
                  </div>
                  <div className="collab-comments">
                    <strong>Comments ({taskComments.length})</strong>
                    {taskComments.map((comment) => <div className="collab-comment" key={comment._id}><span>{comment.author?.name || "Team member"} <small>{displayTimestamp(comment.createdAt)}</small></span><p>{comment.body}</p></div>)}
                    <form className="collab-comment-form" onSubmit={(event) => submitTaskComment(event, task)}>
                      <textarea name="body" required maxLength="2000" rows="2" placeholder="Add an update or use @ to mention a teammate" value={commentDrafts[task._id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [task._id]: event.target.value }))} />
                      <div>{data.mentionUsers.length > 0 && <select aria-label="Mention a teammate" value="" onChange={(event) => addMention(task._id, event.target.value)}><option value="">Mention teammate…</option>{data.mentionUsers.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}</select>}<button type="submit" className="collab-primary-button" disabled={saving || !(commentDrafts[task._id] || "").trim()}>{saving ? "Sending…" : "Comment"}</button></div>
                    </form>
                  </div>
                </article>;
              })}{!filteredTasks.length && <div className="collab-empty">{data.tasks.length ? "No tasks match these filters." : canManage ? "No work has been assigned yet." : "You have no assigned work at the moment."}</div>}</div> : <div className="collab-calendar">
                <div className="collab-calendar-heading"><button type="button" onClick={() => setCalendarMonth(new Date(monthYear, monthNumber - 1, 1))} aria-label="Previous month">‹</button><strong>{calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => setCalendarMonth(new Date(monthYear, monthNumber + 1, 1))} aria-label="Next month">›</button></div>
                <div className="collab-calendar-grid">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <strong className="collab-calendar-weekday" key={day}>{day}</strong>)}
                  {calendarCells.map((day, index) => {
                    if (!day) return <div className="collab-calendar-blank" key={`blank-${index}`} />;
                    const key = monthDateKey(monthYear, monthNumber, day);
                    const dayTasks = filteredTasks.filter((task) => task.dueDate && dateKey(task.dueDate) === key);
                    return <div className={`collab-calendar-day ${key === todayKey ? "today" : ""}`} key={key}><span>{day}</span>{dayTasks.slice(0, 3).map((task) => <small key={task._id} title={task.title}>{task.title}</small>)}{dayTasks.length > 3 && <small>+{dayTasks.length - 3} more</small>}</div>;
                  })}
                </div>
                <p className="collab-calendar-caption">{filteredTasks.filter((task) => task.dueDate && dateKey(task.dueDate).startsWith(`${monthYear}-${String(monthNumber + 1).padStart(2, "0")}`)).length} tasks due this month · {filteredTasks.filter((task) => !task.dueDate).length} without due dates</p>
              </div>}
            </>}
            {data && activeSection === "onboarding" && <>
              {canManage && <form className="collab-form collab-inline-form" onSubmit={submitOnboarding}>
                <h3>Create an onboarding checklist</h3>
                <div className="collab-form-grid">
                  <label>Checklist title<input name="title" required maxLength="160" placeholder="First week essentials" /></label>
                  <label>Employee<select name="employeeId" required defaultValue=""><option value="" disabled>Choose an employee</option>{data.employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.department}</option>)}</select></label>
                  <label className="wide">Checklist items (one per line)<textarea name="itemsText" required rows="4" placeholder={"Complete profile\nMeet your manager\nSet up required tools"} /></label>
                </div>
                <button className="collab-primary-button" type="submit" disabled={saving || !data.employees.length}>{saving ? "Creating…" : "Create checklist"}</button>
              </form>}
              <div className="collab-record-list">{data.onboarding.map((checklist) => {
                const completedCount = checklist.items.filter((item) => item.completed).length;
                return <article className="collab-record collab-onboarding-card" key={checklist._id}>
                  <div className="collab-record-top"><div><h3>{checklist.title}</h3><small>{canManage ? checklist.employee?.name || "Employee" : "Your onboarding"} · {completedCount} of {checklist.items.length} complete</small></div><strong className="collab-progress-label">{Math.round((completedCount / checklist.items.length) * 100)}%</strong></div>
                  <div className="collab-progress-track"><span style={{ width: `${(completedCount / checklist.items.length) * 100}%` }} /></div>
                  <div className="collab-onboarding-items">{checklist.items.map((item) => <label className={`collab-todo ${item.completed ? "completed" : ""}`} key={item._id}><input type="checkbox" checked={item.completed} onChange={() => updateOnboardingItem(checklist, item)} /><span><strong>{item.title}</strong>{item.completedAt && <small>Completed {displayTimestamp(item.completedAt)}</small>}</span></label>)}</div>
                </article>;
              })}{!data.onboarding.length && <div className="collab-empty">{canManage ? "No onboarding checklists yet." : "Your onboarding checklist will appear here when HR assigns it."}</div>}</div>
            </>}
            {data && activeSection === "announcements" && <>
              {canManage && <form className="collab-form collab-inline-form" onSubmit={(event) => submitForm(event, "announcements")}>
                <h3>Share an organization update</h3>
                <div className="collab-form-grid"><label>Title<input name="title" required maxLength="160" placeholder="A note for the whole team" /></label><label className="wide">Message<textarea name="message" required maxLength="2000" rows="3" placeholder="Share an update, reminder, or announcement" /></label></div>
                <button className="collab-primary-button" type="submit" disabled={saving}>{saving ? "Publishing…" : "Publish update"}</button>
              </form>}
              <div className="collab-record-list">{data.announcements.map((announcement) => <article className="collab-record collab-announcement" key={announcement._id}>
                <div className="collab-record-top"><h3>{announcement.title}</h3><small>{displayTimestamp(announcement.createdAt)} · {announcement.createdBy?.name || "Organization"}</small></div>
                <p className="collab-record-body">{announcement.message}</p>
              </article>)}{!data.announcements.length && <div className="collab-empty">No organization updates yet.</div>}</div>
            </>}
          </div>
        </section>
      </div>}
    </>
  );
}
