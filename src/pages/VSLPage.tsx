const VSLPage = () => {
  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ctaGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45,159,147,0.5), 0 4px 24px rgba(45,159,147,0.25); }
          50%       { box-shadow: 0 0 0 8px rgba(45,159,147,0), 0 4px 32px rgba(45,159,147,0.5); }
        }
        .vsl-hero {
          animation: fadeInUp 0.8s ease both;
        }
        .vsl-video {
          animation: fadeInUp 0.8s 0.25s ease both;
        }
        .vsl-cta {
          animation: fadeIn 0.6s 3s ease both;
          opacity: 0;
        }
        .vsl-bullets {
          animation: fadeIn 0.6s 3.3s ease both;
          opacity: 0;
        }
        .cta-btn {
          animation: ctaGlow 2.4s 3.6s ease-in-out infinite;
          transition: background-color 0.2s ease, transform 0.15s ease;
        }
        .cta-btn:hover {
          background-color: #34b5a7;
          transform: translateY(-1px);
        }
        .cta-btn:active {
          transform: translateY(0);
        }
      `}</style>

      <div
        style={{ backgroundColor: "#0f1923", minHeight: "100vh", position: "relative", overflow: "hidden" }}
      >
        {/* Low-poly geometric triangle overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.065,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          <svg
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern
                id="vsl-geo"
                x="0"
                y="0"
                width="140"
                height="121.24"
                patternUnits="userSpaceOnUse"
              >
                {/* Equilateral triangle grid */}
                <polygon
                  points="70,0 140,121.24 0,121.24"
                  fill="none"
                  stroke="#a0c4c1"
                  strokeWidth="0.6"
                />
                <polygon
                  points="0,0 70,121.24 -70,121.24"
                  fill="none"
                  stroke="#a0c4c1"
                  strokeWidth="0.6"
                />
                <polygon
                  points="140,0 210,121.24 70,121.24"
                  fill="none"
                  stroke="#a0c4c1"
                  strokeWidth="0.6"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#vsl-geo)" />
          </svg>
        </div>

        {/* Page content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "48px 20px 40px",
          }}
        >
          {/* ── Logo ── */}
          <div className="vsl-hero" style={{ marginBottom: "32px", textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                width: "240px",
              }}
            >
              {/* Compass / crosshair SVG */}
              <svg
                width="68"
                height="68"
                viewBox="0 0 68 68"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer circle */}
                <circle cx="34" cy="34" r="30" stroke="#2d9f93" strokeWidth="2.5" />
                {/* Crosshair lines */}
                <line x1="34" y1="4" x2="34" y2="14" stroke="#2d9f93" strokeWidth="2" strokeLinecap="round" />
                <line x1="34" y1="54" x2="34" y2="64" stroke="#2d9f93" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="34" x2="14" y2="34" stroke="#2d9f93" strokeWidth="2" strokeLinecap="round" />
                <line x1="54" y1="34" x2="64" y2="34" stroke="#2d9f93" strokeWidth="2" strokeLinecap="round" />
                {/* Inner ring */}
                <circle cx="34" cy="34" r="6" stroke="#2d9f93" strokeWidth="1.5" />
                {/* Arrow pointing upper-right (shadow/edge) */}
                <polyline
                  points="32,26 44,22 40,34"
                  stroke="#8a8a8a"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {/* Arrow pointing upper-right (main) */}
                <polyline
                  points="30,28 42,20 38,32"
                  stroke="#2d9f93"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <line x1="34" y1="34" x2="42" y2="20" stroke="#2d9f93" strokeWidth="2" strokeLinecap="round" />
              </svg>

              {/* Brand name */}
              <div>
                <div
                  style={{
                    fontFamily: "Inter, -apple-system, sans-serif",
                    fontWeight: 800,
                    fontSize: "22px",
                    letterSpacing: "0.18em",
                    color: "#f5f0e1",
                    lineHeight: 1,
                  }}
                >
                  BID ASSASSIN
                </div>
                <div
                  style={{
                    fontFamily: "Inter, -apple-system, sans-serif",
                    fontWeight: 500,
                    fontSize: "10px",
                    letterSpacing: "0.22em",
                    color: "#2d9f93",
                    marginTop: "5px",
                    lineHeight: 1,
                  }}
                >
                  PRECISION PROPOSAL SOFTWARE
                </div>
              </div>
            </div>
          </div>

          {/* ── Headline ── */}
          <h1
            className="vsl-hero"
            style={{
              fontFamily: "Inter, -apple-system, sans-serif",
              fontWeight: 800,
              color: "#f5f0e1",
              textAlign: "center",
              maxWidth: "700px",
              fontSize: "clamp(1.6rem, 4vw, 3rem)",
              lineHeight: 1.2,
              marginBottom: "36px",
              animationDelay: "0.1s",
            }}
          >
            How Commercial Concrete Subs Are Winning 3x More Bids Without Hiring an Estimator
          </h1>

          {/* ── Video placeholder ── */}
          <div
            className="vsl-video"
            style={{
              width: "100%",
              maxWidth: "800px",
              marginBottom: "36px",
            }}
          >
            <div
              style={{
                position: "relative",
                paddingTop: "56.25%", /* 16:9 */
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                overflow: "hidden",
                boxShadow: "0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,159,147,0.12)",
                backgroundColor: "#0a1118",
              }}
            >
              {/* PASTE VIDALYTICS EMBED CODE HERE */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Play icon placeholder */}
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="32" r="30" stroke="rgba(45,159,147,0.4)" strokeWidth="1.5" />
                  <polygon points="26,20 48,32 26,44" fill="rgba(45,159,147,0.5)" />
                </svg>
                <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px", letterSpacing: "0.1em" }}>
                  VIDEO LOADING
                </span>
              </div>
            </div>
          </div>

          {/* ── CTA Button ── */}
          <div className="vsl-cta" style={{ textAlign: "center", marginBottom: "28px" }}>
            <a
              href="https://buy.stripe.com/PLACEHOLDER"
              style={{ textDecoration: "none" }}
            >
              <button
                className="cta-btn"
                style={{
                  backgroundColor: "#2d9f93",
                  color: "#ffffff",
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontWeight: 700,
                  fontSize: "1.2rem",
                  padding: "16px 40px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-block",
                }}
              >
                Start Your Free 14-Day Trial
              </button>
            </a>
            <p
              style={{
                marginTop: "12px",
                color: "#6b7280",
                fontSize: "0.85rem",
                fontFamily: "Inter, -apple-system, sans-serif",
              }}
            >
              Just $197/mo after your trial. Cancel anytime.
            </p>
          </div>

          {/* ── Reinforcement bullets ── */}
          <div
            className="vsl-bullets"
            style={{
              maxWidth: "500px",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "48px",
            }}
          >
            {[
              "AI-powered proposals in under 5 minutes",
              "Find commercial leads before your competitors",
              "4 AI coaching tools built for subs",
              "Works for concrete, electrical, HVAC, and more",
            ].map((bullet) => (
              <div
                key={bullet}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                {/* Teal checkmark */}
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <circle cx="9" cy="9" r="9" fill="rgba(45,159,147,0.18)" />
                  <polyline points="5,9.5 7.5,12 13,6.5" stroke="#2d9f93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                <span
                  style={{
                    color: "#9ca3af",
                    fontSize: "0.95rem",
                    fontFamily: "Inter, -apple-system, sans-serif",
                  }}
                >
                  {bullet}
                </span>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <p
            style={{
              color: "#374151",
              fontSize: "0.72rem",
              fontFamily: "Inter, -apple-system, sans-serif",
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
          >
            Colossians 3:23 &mdash; Tiberius AI LLC
          </p>
        </div>
      </div>
    </>
  );
};

export default VSLPage;
