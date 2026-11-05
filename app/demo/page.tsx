export const metadata = { title: "Side by side · AI Front Desk (prototype)" };

export default function Page() {
  return (
    <div>
      <div className="banner">
        <span>Take-home prototype · fictional center and data · parent phone on the left, staff control center on the right</span>
        <a href="/">About</a>
      </div>
      <div className="duo">
        <iframe src="/parent" title="Parent front desk" width={400} height={860} />
        <iframe src="/ops" title="Operator control center" width={980} height={860} style={{ maxWidth: "100%" }} />
      </div>
    </div>
  );
}
