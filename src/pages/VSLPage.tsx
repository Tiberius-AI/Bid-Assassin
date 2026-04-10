import { useEffect } from "react";

const VSLPage = () => {
  // Inject Vidalytics player after DOM is ready
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = `(function (v, i, d, a, l, y, t, c, s) {
      y='_'+d.toLowerCase();c=d+'L';if(!v[d]){v[d]={};}if(!v[c]){v[c]={};}if(!v[y]){v[y]={};}var vl='Loader',vli=v[y][vl],vsl=v[c][vl + 'Script'],vlf=v[c][vl + 'Loaded'],ve='Embed';
      if (!vsl){vsl=function(u,cb){
          if(t){cb();return;}s=i.createElement("script");s.type="text/javascript";s.async=1;s.src=u;
          if(s.readyState){s.onreadystatechange=function(){if(s.readyState==="loaded"||s.readyState=="complete"){s.onreadystatechange=null;vlf=1;cb();}};}else{s.onload=function(){vlf=1;cb();};}
          i.getElementsByTagName("head")[0].appendChild(s);
      };}
      vsl(l+'loader.min.js',function(){if(!vli){var vlc=v[c][vl];vli=new vlc();}vli.loadScript(l+'player.min.js',function(){var vec=v[d][ve];t=new vec();t.run(a);});});
    })(window, document, 'Vidalytics', 'vidalytics_embed_4vHW1vhfhtW0EbyQ', 'https://fast.vidalytics.com/embeds/0aVk09nm/4vHW1vhfhtW0EbyQ/');`;
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

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
        .vsl-hero  { animation: fadeInUp 0.8s ease both; }
        .vsl-video { animation: fadeInUp 0.8s 0.25s ease both; }
        .vsl-cta   { animation: fadeIn 0.6s 3s ease both; opacity: 0; }
        .vsl-bullets { animation: fadeIn 0.6s 3.3s ease both; opacity: 0; }
        .cta-btn {
          animation: ctaGlow 2.4s 3.6s ease-in-out infinite;
          transition: background-color 0.2s ease, transform 0.15s ease;
        }
        .cta-btn:hover  { background-color: #34b5a7 !important; transform: translateY(-1px); }
        .cta-btn:active { transform: translateY(0); }
      `}</style>

      <div style={{ backgroundColor: "#0f1923", minHeight: "100vh", position: "relative", overflow: "hidden" }}>

        {/* ── Low-poly geometric triangle overlay ── */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.065, pointerEvents: "none", zIndex: 0 }}>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="vsl-geo" x="0" y="0" width="140" height="121.24" patternUnits="userSpaceOnUse">
                <polygon points="70,0 140,121.24 0,121.24"   fill="none" stroke="#a0c4c1" strokeWidth="0.6" />
                <polygon points="0,0 70,121.24 -70,121.24"   fill="none" stroke="#a0c4c1" strokeWidth="0.6" />
                <polygon points="140,0 210,121.24 70,121.24" fill="none" stroke="#a0c4c1" strokeWidth="0.6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#vsl-geo)" />
          </svg>
        </div>

        {/* ── Page content ── */}
        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "48px 20px 40px",
        }}>

          {/* ── Logo (horizontal, matching original) ── */}
          <div className="vsl-hero" style={{ marginBottom: "32px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "16px" }}>

              {/* Compass icon SVG */}
              <svg width="82" height="82" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  {/* Ring gradient: darker teal (bottom-left) -> brighter teal (top-right) */}
                  <linearGradient id="vsl-ring" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#1a7068" />
                    <stop offset="100%" stopColor="#2dbcac" />
                  </linearGradient>
                  {/* Plane upper face: bright teal */}
                  <linearGradient id="vsl-upper" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#2dbcac" />
                    <stop offset="100%" stopColor="#1a8a80" />
                  </linearGradient>
                  {/* Plane lower face: blue-gray shadow */}
                  <linearGradient id="vsl-lower" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%"   stopColor="#8fb0c4" />
                    <stop offset="100%" stopColor="#5a7a92" />
                  </linearGradient>
                </defs>

                {/*
                  Ring with gaps at N/S/E/W using stroke-dasharray.
                  r=38, circumference=238.76
                  gap=10, dash=49.69
                  dashOffset=54.69 centers the first gap at N after rotate(-90)
                */}
                <circle
                  cx="50" cy="50" r="38"
                  stroke="url(#vsl-ring)"
                  strokeWidth="8"
                  strokeDasharray="49.69 10"
                  strokeDashoffset="54.69"
                  transform="rotate(-90 50 50)"
                />

                {/* Tick marks at N/S/E/W -- extend through ring gap outward */}
                {/* N */ } <line x1="50" y1="5"  x2="50" y2="22" stroke="url(#vsl-ring)" strokeWidth="5" strokeLinecap="round" />
                {/* S */ } <line x1="50" y1="95" x2="50" y2="78" stroke="url(#vsl-ring)" strokeWidth="5" strokeLinecap="round" />
                {/* E */ } <line x1="95" y1="50" x2="78" y2="50" stroke="url(#vsl-ring)" strokeWidth="5" strokeLinecap="round" />
                {/* W */ } <line x1="5"  y1="50" x2="22" y2="50" stroke="url(#vsl-ring)" strokeWidth="5" strokeLinecap="round" />

                {/* Paper airplane -- lower (shadow) face first so upper face renders on top */}
                <polygon points="70,23 45,54 22,67" fill="url(#vsl-lower)" />
                <polygon points="70,23 22,33 45,54" fill="url(#vsl-upper)" />

                {/* Fold crease on upper face */}
                <line x1="35" y1="44" x2="70" y2="23" stroke="#0f8a80" strokeWidth="0.9" opacity="0.7" />

                {/* Small center target circle */}
                <circle cx="50" cy="50" r="4" stroke="url(#vsl-ring)" strokeWidth="1.8" />
              </svg>

              {/* Brand text */}
              <div>
                <div style={{
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontWeight: 800,
                  fontSize: "26px",
                  letterSpacing: "0.06em",
                  color: "#f5f0e1",
                  lineHeight: 1,
                }}>
                  BID ASSASSIN
                </div>
                <div style={{
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontWeight: 500,
                  fontSize: "9.5px",
                  letterSpacing: "0.2em",
                  color: "#2d9f93",
                  marginTop: "6px",
                  lineHeight: 1,
                }}>
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

          {/* ── Vidalytics video embed ── */}
          <div
            className="vsl-video"
            style={{
              width: "100%",
              maxWidth: "800px",
              marginBottom: "36px",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              overflow: "hidden",
              boxShadow: "0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(45,159,147,0.12)",
            }}
          >
            <div
              id="vidalytics_embed_4vHW1vhfhtW0EbyQ"
              style={{ width: "100%", position: "relative", paddingTop: "56.25%" }}
            />
          </div>

          {/* ── CTA Button ── */}
          <div className="vsl-cta" style={{ textAlign: "center", marginBottom: "28px" }}>
            <a href="https://buy.stripe.com/PLACEHOLDER" style={{ textDecoration: "none" }}>
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
            <p style={{
              marginTop: "12px",
              color: "#6b7280",
              fontSize: "0.85rem",
              fontFamily: "Inter, -apple-system, sans-serif",
            }}>
              Just $197/mo after your trial. Cancel anytime.
            </p>
          </div>

          {/* ── Reinforcement bullets ── */}
          <div
            className="vsl-bullets"
            style={{
              maxWidth: "500px", width: "100%",
              display: "flex", flexDirection: "column", gap: "12px",
              marginBottom: "48px",
            }}
          >
            {[
              "AI-powered proposals in under 5 minutes",
              "Find commercial leads before your competitors",
              "4 AI coaching tools built for subs",
              "Works for concrete, electrical, HVAC, and more",
            ].map((bullet) => (
              <div key={bullet} style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <circle cx="9" cy="9" r="9" fill="rgba(45,159,147,0.18)" />
                  <polyline points="5,9.5 7.5,12 13,6.5" stroke="#2d9f93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
                <span style={{ color: "#9ca3af", fontSize: "0.95rem", fontFamily: "Inter, -apple-system, sans-serif" }}>
                  {bullet}
                </span>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <p style={{
            color: "#374151",
            fontSize: "0.72rem",
            fontFamily: "Inter, -apple-system, sans-serif",
            textAlign: "center",
            letterSpacing: "0.04em",
          }}>
            Colossians 3:23 &mdash; Tiberius AI LLC
          </p>

        </div>
      </div>
    </>
  );
};

export default VSLPage;
