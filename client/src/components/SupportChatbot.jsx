import { useEffect, useRef, useState } from "react";

const suggestions = [
  "How do I add an employee?",
  "How do I approve leave?",
  "How do employee logins work?",
];

function getAnswer(question) {
  const text = question.toLowerCase();
  if (/\b(employee|employees|team member|staff)\b/.test(text) && /\b(add|create|new|register)\b/.test(text)) {
    return "Open Employees in the sidebar and choose “Add employee.” Complete the employee details and save. To give them a portal login, set EMPLOYEE_EMAIL and EMPLOYEE_PASSWORD in your local .env, then run npm run create:employee-user.";
  }
  if (/\b(leave|time off|holiday)\b/.test(text)) {
    return "Open Leave management to review requests. Choose Approve or Decline beside a pending request. Employees can submit their own requests from the employee portal.";
  }
  if (/\b(attendance|check.?in|check.?out|hours)\b/.test(text)) {
    return "Open Attendance to view or record attendance. Employees can check in and check out from their employee portal. The system calculates hours from the recorded times.";
  }
  if (/\b(payroll|salary|pay|wage)\b/.test(text)) {
    return "Open Payroll to create a pay-period record. Select the employee, enter salary, bonus, and deductions, then save. Review the record before processing payroll.";
  }
  if (/\b(recruit|candidate|hiring|job|position)\b/.test(text)) {
    return "Open Recruitment to add candidates. Use the stage selector in the candidate list to update their hiring progress.";
  }
  if (/\b(performance|review|feedback|rating)\b/.test(text)) {
    return "Open Performance to create a review, choose the employee, enter the review period and reviewer, then add a rating and feedback.";
  }
  if (/\b(logins?|sign.?in|password|account|employee portal|hr portal)\b/.test(text)) {
    return "HR and administrators sign in at /login. Employees use /employee-login. Accounts are individually provisioned by an administrator; employees cannot self-register. Use Forgot password? on either sign-in page to request a reset link.";
  }
  if (/\b(chart|graph|dashboard|analytics)\b/.test(text)) {
    return "The dashboard charts show hiring, attendance, department breakdowns, and check-in patterns. They update from your saved records, so charts may be empty until you add data.";
  }
  if (/\b(log ?out|sign ?out)\b/.test(text)) {
    return "Select the sign-out icon at the bottom of the sidebar. Employees can use Sign out in the top-right of their portal. Both actions revoke the active session.";
  }
  return "I can help with employees, attendance, leave, payroll, recruitment, performance, logins, and dashboard charts. Choose a suggested question or contact support if you need more help.";
}

export default function SupportChatbot({ open, onClose, onOpen }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const messageListRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (!messages.length) {
      setMessages([{ id: "welcome", author: "bot", text: "Hi! I’m the PeopleDesk support assistant. What can I help you with?" }]);
    }
    inputRef.current?.focus();
  }, [open, messages.length]);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  function sendMessage(text = draft) {
    const question = text.trim();
    if (!question) return;
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, author: "user", text: question },
      { id: `${Date.now()}-bot`, author: "bot", text: getAnswer(question) },
    ]);
    setDraft("");
  }

  return (
    <>
      {open && <section className="support-chat" role="dialog" aria-label="PeopleDesk support chatbot">
        <header className="support-chat-header">
          <span className="support-chat-avatar">P</span>
          <span className="support-chat-heading"><strong>PeopleDesk support</strong><small><i /> Help assistant</small></span>
          <button type="button" className="support-chat-close" onClick={onClose} aria-label="Close support chat">×</button>
        </header>
        <div className="support-chat-messages" ref={messageListRef} aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`support-message ${message.author}`}>{message.text}</div>)}
          <div className="support-chat-suggestions">
            {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)}>{suggestion}</button>)}
          </div>
        </div>
        <form className="support-chat-form" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question…" aria-label="Type your support question" maxLength={500} />
          <button type="submit" disabled={!draft.trim()} aria-label="Send message">↑</button>
        </form>
        <a className="support-chat-email" href="mailto:support@peopledesk.example">Still need help? Email support</a>
      </section>}
      <button type="button" className={`support-chat-launcher ${open ? "chat-open" : ""}`} onClick={open ? onClose : onOpen} aria-label={open ? "Close support chat" : "Open support chat"} aria-expanded={open}>
        <span aria-hidden="true">{open ? "×" : "✳"}</span>{!open && <small>Support</small>}
      </button>
    </>
  );
}
