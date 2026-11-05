import Link from "next/link";

export default function Landing() {
  return (
    <div>
      <div className="banner">
        <span>Take-home prototype · fictional center and data · not a brightwheel product</span>
      </div>
      <main className="landing">
        <div className="stack" style={{ gap: 8 }}>
          <span className="tag tag-ai" style={{ alignSelf: "flex-start" }}>AI Front Desk</span>
          <h1 style={{ fontSize: 30 }}>Sunnyside Daycare&apos;s front desk, answered in seconds</h1>
          <p className="muted" style={{ maxWidth: 680 }}>
            Parents get today&apos;s answers and can tell the center about changes in one tap. Facts come straight from the center&apos;s records, written by code; the AI reads the question and words policy answers. Anything about a child&apos;s health, pickup, money or a complaint goes to a person. Staff see every answer, fix gaps once, and decide what the assistant may say.
          </p>
        </div>
        <div className="entry-grid">
          <Link className="card entry" href="/parent">
            <b>Parent front desk</b>
            <span className="small muted">Phone view. Try the five sample questions, the buttons, and Talk to a person.</span>
          </Link>
          <Link className="card entry" href="/ops">
            <b>Staff control center</b>
            <span className="small muted">Inbox with reply-by times, what parents asked, source of truth, usage.</span>
          </Link>
          <Link className="card entry" href="/demo">
            <b>Side by side</b>
            <span className="small muted">Laptop view: ask on the phone, watch it land in the staff inbox.</span>
          </Link>
          <Link className="card entry" href="/team">
            <b>brightwheel team view</b>
            <span className="small muted">Automatic quality checks, model comparison, live clickstream. Not shown to centers.</span>
          </Link>
        </div>
        <section className="card stack">
          <b>Things to try</b>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }} className="small">
            <li>&ldquo;Are you open on Veterans Day?&rdquo; then &ldquo;Is there care the day after Thanksgiving?&rdquo; (a gap), then fix it in What parents asked.</li>
            <li>&ldquo;My child has a fever, can they come in?&rdquo; quotes the rule and hands the decision to a person.</li>
            <li>&ldquo;I forgot to pack lunch. Can you provide lunch today and what is it?&rdquo; creates a pending request; confirm it in the staff inbox.</li>
            <li>Switch the demo clock in the black bar to Pickup to see the afternoon buttons.</li>
            <li>In Source of truth, set a topic to &ldquo;AI drafts, staff send&rdquo; and ask about it.</li>
          </ul>
          <span className="xs muted">Everything you do stays in this browser; Reset demo in the black bar starts over. Anonymous usage events are recorded to measure the prototype.</span>
        </section>
      </main>
    </div>
  );
}
