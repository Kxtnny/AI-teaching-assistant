import Link from "next/link";
import "../dashboard.css";

export default async function DashboardLandingPage({params}:{params:Promise<{userId:string}>}) {
  const {userId} = await params;
  return (
    <>
      {/* HERO */}
      <header id="home" className="hero">
        <div className="hero-bg" aria-hidden="true">
          <div className="shape shape-1" />
          <div className="shape shape-2" />
          <div className="shape shape-3" />
          <div className="shape shape-4" />
        </div>

        <div className="hero-inner">
          <div className="hero-left">
            <div className="hero-kicker">
              Learn faster by teaching
            </div>
            <h1 className="hero-title">Learning Analytics Dashboard</h1>
            <div className="hero-actions">
              <Link className="btn btn-primary" href={`/dashboard/${userId}/educator/courses`}>
                Educator
              </Link>
              <Link className="btn btn-secondary" href={`/dashboard/${userId}/learner/courses`}>
                Learner
              </Link>
            </div>
          </div>
        </div>
      </header>
      {/* FOOTER */}
      <footer className="quote-footer">
        <p>
          "If you want to master something, teach it." — <em>Richard Feynman</em>
        </p>
      </footer>
    </>
  );
}