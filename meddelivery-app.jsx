import { useState, useEffect, useRef } from "react";

// ─── Design tokens ───────────────────────────────────────────────────────────
const theme = {
  bg: "#0A0F1E",
  bgCard: "#0F1729",
  bgCardAlt: "#131D35",
  accent: "#00D4AA",
  accentDim: "#00D4AA22",
  accentSoft: "#00D4AA44",
  gold: "#F5A623",
  danger: "#FF4D6D",
  purple: "#7B61FF",
  text: "#E8EEF8",
  textMuted: "#6B7A9A",
  textDim: "#3D4E72",
  border: "#1E2D4E",
  borderLight: "#253354",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${theme.bg}; color: ${theme.text}; font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${theme.bg}; }
  ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 3px; }
  
  @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
  @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  @keyframes routeLine { from { stroke-dashoffset: 400; } to { stroke-dashoffset: 0; } }
  
  .fade-up { animation: fadeUp 0.5s ease both; }
  .fade-up-2 { animation: fadeUp 0.5s ease 0.1s both; }
  .fade-up-3 { animation: fadeUp 0.5s ease 0.2s both; }
  .float { animation: float 3s ease-in-out infinite; }
  
  .nav-tab { cursor:pointer; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:500; color:${theme.textMuted}; transition:all .2s; border:none; background:none; }
  .nav-tab:hover { color:${theme.text}; background:${theme.accentDim}; }
  .nav-tab.active { color:${theme.accent}; background:${theme.accentDim}; }
  
  .card { background:${theme.bgCard}; border:1px solid ${theme.border}; border-radius:16px; padding:20px; }
  .card-alt { background:${theme.bgCardAlt}; border:1px solid ${theme.borderLight}; border-radius:12px; padding:16px; }
  
  .btn { cursor:pointer; border:none; border-radius:10px; padding:10px 20px; font-family:'DM Sans',sans-serif; font-weight:500; font-size:14px; transition:all .2s; }
  .btn-primary { background:${theme.accent}; color:#0A0F1E; }
  .btn-primary:hover { background:#00FFCC; transform:translateY(-1px); box-shadow:0 6px 24px #00D4AA44; }
  .btn-ghost { background:transparent; color:${theme.text}; border:1px solid ${theme.border}; }
  .btn-ghost:hover { border-color:${theme.accent}; color:${theme.accent}; }
  .btn-danger { background:${theme.danger}22; color:${theme.danger}; border:1px solid ${theme.danger}44; }
  
  .status-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:500; }
  .status-delivered { background:#00D4AA22; color:${theme.accent}; }
  .status-transit { background:#F5A62322; color:${theme.gold}; }
  .status-pending { background:#7B61FF22; color:${theme.purple}; }
  .status-cancelled { background:#FF4D6D22; color:${theme.danger}; }
  
  .metric-card { background:${theme.bgCard}; border:1px solid ${theme.border}; border-radius:16px; padding:20px; position:relative; overflow:hidden; }
  .metric-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
  .metric-card.green::before { background:linear-gradient(90deg,transparent,${theme.accent},transparent); }
  .metric-card.gold::before { background:linear-gradient(90deg,transparent,${theme.gold},transparent); }
  .metric-card.purple::before { background:linear-gradient(90deg,transparent,${theme.purple},transparent); }
  .metric-card.red::before { background:linear-gradient(90deg,transparent,${theme.danger},transparent); }
  
  .input { background:${theme.bgCardAlt}; border:1px solid ${theme.border}; border-radius:10px; padding:10px 14px; color:${theme.text}; font-family:'DM Sans',sans-serif; font-size:14px; width:100%; outline:none; transition:border .2s; }
  .input:focus { border-color:${theme.accent}; }
  .input::placeholder { color:${theme.textMuted}; }
  
  .table-row { border-bottom:1px solid ${theme.border}; }
  .table-row:hover { background:${theme.accentDim}; }
  .table-row:last-child { border-bottom:none; }
  
  .progress-bar { height:6px; background:${theme.border}; border-radius:3px; overflow:hidden; }
  .progress-fill { height:100%; border-radius:3px; transition:width 1s ease; }
  
  .route-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .route-line { width:2px; height:30px; margin:0 auto; }
  
  .badge { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; font-size:11px; font-weight:700; }
`;

// ─── Mock data ────────────────────────────────────────────────────────────────
const orders = [
  { id: "ORX-1042", customer: "Priya Sharma", address: "Kiratpur Sahib, Sri Anandpur Sahib", distance: 2.4, items: 3, total: 840, status: "delivered", time: "12 min ago", medicines: ["Paracetamol 500mg", "Vitamin C", "Cough Syrup"] },
  { id: "ORX-1043", customer: "Rajesh Kumar", address: "Nangal Rd, Sri Anandpur Sahib", distance: 4.1, items: 5, total: 1250, status: "transit", time: "Now", medicines: ["Metformin 500mg", "BP Tablet", "Antacid"] },
  { id: "ORX-1044", customer: "Anita Verma", address: "Gurdwara Chowk, Sri Anandpur Sahib", distance: 3.7, items: 2, total: 420, status: "transit", time: "Now", medicines: ["Amoxicillin", "Ibuprofen"] },
  { id: "ORX-1045", customer: "Sunil Mehta", address: "Keshgarh Sahib Rd, Sri Anandpur Sahib", distance: 5.2, items: 7, total: 2100, status: "pending", time: "2 min ago", medicines: ["Insulin", "Glucometer Strips", "Metformin"] },
  { id: "ORX-1046", customer: "Deepika Singh", address: "Rupnagar Rd, Sri Anandpur Sahib", distance: 6.8, items: 4, total: 990, status: "pending", time: "5 min ago", medicines: ["Thyroid Med", "Calcium D3", "Iron Tablets"] },
  { id: "ORX-1047", customer: "Harpreet Kaur", address: "Bhakra Canal Side, Sri Anandpur Sahib", distance: 3.2, items: 1, total: 180, status: "delivered", time: "1h ago", medicines: ["Azithromycin 500mg"] },
];

const routeGroups = [
  { direction: "North (Kiratpur Sahib → Nangal Rd)", orders: ["ORX-1042", "ORX-1043"], distance: "6.5 km", eta: "18 min", rider: "Arjun Singh" },
  { direction: "South (Gurdwara Chowk → Rupnagar Rd)", orders: ["ORX-1044", "ORX-1045", "ORX-1046"], distance: "10.2 km", eta: "28 min", rider: "Vikram Rao" },
  { direction: "East (Bhakra Canal Side)", orders: ["ORX-1047"], distance: "3.2 km", eta: "9 min", rider: "Mohit Dev" },
];

const weeklySales = [180, 240, 195, 310, 280, 420, 390];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const maxSale = Math.max(...weeklySales);

const myOrders = [
  { id: "ORX-1042", date: "Today, 2:30 PM", items: ["Paracetamol 500mg ×2", "Vitamin C ×1"], total: 840, status: "delivered", eta: null },
  { id: "ORX-1039", date: "Yesterday, 11 AM", items: ["Cough Syrup ×1", "Antacid ×2"], total: 420, status: "delivered", eta: null },
  { id: "ORX-1043", date: "Today, 4:10 PM", items: ["Metformin 500mg ×1"], total: 250, status: "transit", eta: "~8 min away" },
];

const trackSteps = [
  { label: "Order Placed", done: true, time: "4:10 PM" },
  { label: "Pharmacist Reviewing", done: true, time: "4:12 PM" },
  { label: "Packed & Ready", done: true, time: "4:20 PM" },
  { label: "Out for Delivery", done: true, time: "4:28 PM" },
  { label: "Delivered", done: false, time: "~4:36 PM" },
];

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const features = [
    { icon: "💊", title: "Prescription Upload", desc: "Upload your prescription and we'll pick & pack your medicines instantly." },
    { icon: "🚀", title: "Express Delivery", desc: "Get medicines at your door in under 30 minutes from our local pharmacy." },
    { icon: "📍", title: "Live Tracking", desc: "Watch your order move in real-time on a live map from shop to doorstep." },
    { icon: "🔔", title: "Smart Refills", desc: "Never run out. Auto-reminders and one-tap reorder for your regular meds." },
    { icon: "🔒", title: "Verified Medicines", desc: "Every medicine sourced directly from licensed suppliers with batch verification." },
    { icon: "💬", title: "Pharmacist Chat", desc: "Get expert advice from our in-house pharmacist before you order." },
  ];

  return (
    <div style={{ minHeight: "100vh", overflowX: "hidden" }}>
      {/* Navbar */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: scrolled ? `${theme.bg}ee` : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? `1px solid ${theme.border}` : "none",
        padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "all .3s"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${theme.accent}, ${theme.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💊</div>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>MediRun</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => onNavigate("customer")} style={{ fontSize: 13 }}>Customer App</button>
          <button className="btn btn-primary" onClick={() => onNavigate("admin")} style={{ fontSize: 13 }}>Admin Panel</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "80px 40px 60px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        {/* BG glow */}
        <div style={{ position: "absolute", top: -100, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, ${theme.accent}15, transparent 70%)`, pointerEvents: "none" }} />

        <div className="fade-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${theme.accentDim}`, border: `1px solid ${theme.accentSoft}`, borderRadius: 20, padding: "6px 16px", fontSize: 13, color: theme.accent, marginBottom: 24 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent, animation: "pulse 1.5s infinite" }} />
          Now delivering in Sri Anandpur Sahib — 30 min or free
        </div>

        <h1 className="fade-up-2" style={{ fontFamily: "Syne", fontWeight: 800, fontSize: "clamp(36px,6vw,72px)", lineHeight: 1.1, maxWidth: 700, margin: "0 auto 20px" }}>
          Your pharmacy,<br />
          <span style={{ color: theme.accent }}>at your door</span><br />
          in 30 minutes.
        </h1>
        <p className="fade-up-3" style={{ color: theme.textMuted, fontSize: 18, maxWidth: 480, margin: "0 auto 40px", lineHeight: 1.7 }}>
          Order medicines online from MediRun and track every step of your delivery — live.
        </p>

        <div className="fade-up-3" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => onNavigate("customer")} style={{ padding: "14px 32px", fontSize: 16 }}>
            Order Medicines →
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate("admin")} style={{ padding: "14px 32px", fontSize: 16 }}>
            Pharmacy Login
          </button>
        </div>

        {/* Floating stats */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 60, flexWrap: "wrap" }}>
          {[["12,400+", "Orders Delivered"], ["4.9★", "Average Rating"], ["28 min", "Avg Delivery"], ["100%", "Licensed Meds"]].map(([val, label]) => (
            <div key={label} className="card" style={{ textAlign: "center", padding: "16px 24px", minWidth: 120 }}>
              <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 22, color: theme.accent }}>{val}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Mock phone UI */}
      <section style={{ padding: "20px 40px 60px", display: "flex", justifyContent: "center" }}>
        <div className="float" style={{ width: 260, background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 32, padding: 20, boxShadow: `0 40px 80px #00D4AA18` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${theme.accent},${theme.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💊</div>
            <div>
              <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 13 }}>MediRun</div>
              <div style={{ fontSize: 10, color: theme.accent }}>● Live tracking</div>
            </div>
          </div>
          {/* Mini map placeholder */}
          <div style={{ background: `${theme.bgCardAlt}`, borderRadius: 16, padding: 12, marginBottom: 12, position: "relative", overflow: "hidden" }}>
            <svg width="100%" height="80" style={{ display: "block" }}>
              <defs>
                <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={theme.accent} />
                  <stop offset="100%" stopColor={theme.purple} />
                </linearGradient>
              </defs>
              {/* Grid */}
              {[20, 40, 60].map(y => <line key={y} x1="0" y1={y} x2="220" y2={y} stroke={theme.border} strokeWidth="1" />)}
              {[40, 80, 120, 160, 200].map(x => <line key={x} x1={x} y1="0" x2={x} y2="80" stroke={theme.border} strokeWidth="1" />)}
              {/* Route */}
              <polyline points="20,60 60,40 100,45 150,20 200,30" fill="none" stroke="url(#routeGrad)" strokeWidth="2.5" strokeDasharray="6 3" strokeLinecap="round" style={{ animation: "routeLine 2s linear infinite" }} strokeDashoffset="0" />
              {/* Shop */}
              <circle cx="20" cy="60" r="5" fill={theme.accent} />
              <text x="28" y="64" fill={theme.accent} fontSize="9" fontFamily="DM Sans">Shop</text>
              {/* Rider */}
              <circle cx="150" cy="20" r="5" fill={theme.gold} />
              <text x="158" y="24" fill={theme.gold} fontSize="9">🛵</text>
              {/* Home */}
              <circle cx="200" cy="30" r="5" fill={theme.purple} />
              <text x="208" y="34" fill={theme.purple} fontSize="9">🏠</text>
            </svg>
          </div>
          {/* Order card */}
          <div style={{ background: `linear-gradient(135deg,${theme.accent}18,${theme.purple}12)`, border: `1px solid ${theme.accentSoft}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>ORX-1043 · En route</div>
            <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Arriving in ~8 min</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: "75%", background: `linear-gradient(90deg,${theme.accent},${theme.purple})` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "40px 40px 80px" }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 36, textAlign: "center", marginBottom: 8 }}>Everything you need</h2>
        <p style={{ color: theme.textMuted, textAlign: "center", marginBottom: 48 }}>Healthcare delivery, reimagined.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, maxWidth: 900, margin: "0 auto" }}>
          {features.map((f, i) => (
            <div key={f.title} className="card" style={{ transition: "transform .2s, border-color .2s", cursor: "default" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = theme.accentSoft; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = theme.border; }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{f.title}</div>
              <div style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ padding: "0 40px 80px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", background: `linear-gradient(135deg,${theme.accent}22,${theme.purple}22)`, border: `1px solid ${theme.accentSoft}`, borderRadius: 24, padding: "48px 40px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 32, marginBottom: 12 }}>Start your first order</h2>
          <p style={{ color: theme.textMuted, marginBottom: 28 }}>Join 12,000+ customers who trust MediRun for their daily medicines.</p>
          <button className="btn btn-primary" onClick={() => onNavigate("customer")} style={{ padding: "14px 40px", fontSize: 16 }}>
            Get Started — It's Free
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRoute, setSelectedRoute] = useState(null);

  const tabs = ["overview", "orders", "delivery", "analytics"];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Topbar */}
      <header style={{ background: theme.bgCard, borderBottom: `1px solid ${theme.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => onNavigate("landing")} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${theme.accent},${theme.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💊</div>
            <span style={{ fontFamily: "Syne", fontWeight: 700 }}>MediRun</span>
            <span style={{ fontSize: 11, color: theme.textMuted, background: theme.bgCardAlt, padding: "2px 8px", borderRadius: 4, border: `1px solid ${theme.border}` }}>Admin</span>
          </div>
          <div style={{ height: 20, width: 1, background: theme.border }} />
          {tabs.map(t => (
            <button key={t} className={`nav-tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent, animation: "pulse 1.5s infinite" }} />
          <span style={{ fontSize: 13, color: theme.textMuted }}>Live · 6 active orders</span>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${theme.accent},${theme.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
        </div>
      </header>

      <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {activeTab === "overview" && <AdminOverview onNavigate={onNavigate} />}
        {activeTab === "orders" && <AdminOrders />}
        {activeTab === "delivery" && <AdminDelivery />}
        {activeTab === "analytics" && <AdminAnalytics />}
      </div>
    </div>
  );
}

function AdminOverview() {
  const metrics = [
    { label: "Today's Revenue", value: "₹18,420", sub: "+12% vs yesterday", color: "green", icon: "💰" },
    { label: "Orders Today", value: "47", sub: "6 pending right now", color: "purple", icon: "📦" },
    { label: "Avg Delivery Time", value: "26 min", sub: "−3 min this week", color: "gold", icon: "⚡" },
    { label: "Delivery Distance", value: "138 km", sub: "Total today", color: "red", icon: "📍" },
  ];

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 24 }}>Good afternoon, Admin 👋</h1>
        <p style={{ color: theme.textMuted, fontSize: 14, marginTop: 4 }}>Here's what's happening at MediRun today.</p>
      </div>

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {metrics.map(m => (
          <div key={m.label} className={`metric-card ${m.color}`}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: theme.accent }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* Recent orders */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "Syne", fontWeight: 700 }}>Recent Orders</span>
            <span style={{ fontSize: 12, color: theme.accent, cursor: "pointer" }}>View all →</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {["Order ID", "Customer", "Distance", "Total", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: theme.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map(o => (
                <tr key={o.id} className="table-row">
                  <td style={{ padding: "12px 12px", fontSize: 13, fontFamily: "monospace", color: theme.accent }}>{o.id}</td>
                  <td style={{ padding: "12px 12px", fontSize: 13 }}>{o.customer}</td>
                  <td style={{ padding: "12px 12px", fontSize: 13, color: theme.textMuted }}>{o.distance} km</td>
                  <td style={{ padding: "12px 12px", fontSize: 13, fontWeight: 600 }}>₹{o.total}</td>
                  <td style={{ padding: "12px 12px" }}>
                    <span className={`status-pill status-${o.status}`}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sales chart */}
        <div className="card">
          <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 4 }}>Weekly Sales</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 20 }}>Revenue this week</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {weeklySales.map((s, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, color: theme.textMuted }}>₹{s}</div>
                <div style={{ width: "100%", height: `${(s / maxSale) * 90}px`, background: `linear-gradient(180deg,${theme.accent},${theme.accent}88)`, borderRadius: "4px 4px 2px 2px", transition: "height .5s", minHeight: 4 }} />
                <div style={{ fontSize: 10, color: theme.textMuted }}>{days[i]}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: "12px", background: theme.bgCardAlt, borderRadius: 8, display: "flex", justifyContent: "space-between" }}>
            <div><div style={{ fontSize: 11, color: theme.textMuted }}>Total</div><div style={{ fontFamily: "Syne", fontWeight: 700, color: theme.accent }}>₹{weeklySales.reduce((a, b) => a + b, 0).toLocaleString()}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: theme.textMuted }}>Best Day</div><div style={{ fontFamily: "Syne", fontWeight: 700 }}>Sat ₹{Math.max(...weeklySales)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminOrders() {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 22 }}>All Orders</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {["all", "pending", "transit", "delivered"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`nav-tab ${filter === f ? "active" : ""}`} style={{ padding: "6px 14px", fontSize: 12 }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(o => (
          <div key={o.id} className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 20, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: theme.accent, marginBottom: 4 }}>{o.id}</div>
              <div style={{ fontFamily: "Syne", fontWeight: 600, fontSize: 15 }}>{o.customer}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>📍 {o.address}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>Medicines ({o.items} items)</div>
              {o.medicines.map(m => (
                <div key={m} style={{ fontSize: 12, color: theme.text, padding: "2px 8px", background: theme.bgCardAlt, borderRadius: 4, display: "inline-block", margin: "2px 4px 2px 0" }}>{m}</div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>₹{o.total}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>📏 {o.distance} km · {o.time}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <span className={`status-pill status-${o.status}`}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {o.status}
              </span>
              {o.status === "pending" && <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}>Assign Rider</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDelivery() {
  return (
    <div className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 22 }}>Delivery Route Optimizer</h2>
        <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>Orders grouped by delivery direction to maximize efficiency</p>
      </div>

      {/* Route map visualization */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 16 }}>Live Route Map</div>
        <div style={{ background: theme.bgCardAlt, borderRadius: 12, padding: 20, position: "relative", overflow: "hidden" }}>
          <svg width="100%" height="220" viewBox="0 0 800 220" style={{ display: "block" }}>
            <defs>
              <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.accent} /><stop offset="100%" stopColor={theme.purple} />
              </linearGradient>
              <linearGradient id="rg2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.gold} /><stop offset="100%" stopColor={theme.danger} />
              </linearGradient>
            </defs>
            {/* Grid */}
            {[40, 80, 120, 160, 200].map(y => <line key={y} x1="0" y1={y} x2="800" y2={y} stroke={theme.border} strokeWidth="1" />)}
            {[80, 160, 240, 320, 400, 480, 560, 640, 720].map(x => <line key={x} x1={x} y1="0" x2={x} y2="220" stroke={theme.border} strokeWidth="1" />)}

            {/* Shop (center) */}
            <circle cx="400" cy="110" r="12" fill={theme.accent} />
            <text x="420" y="114" fill={theme.accent} fontSize="14" fontFamily="DM Sans" fontWeight="600">MediRun Shop</text>

            {/* Route 1: North */}
            <line x1="400" y1="110" x2="320" y2="40" stroke="url(#rg1)" strokeWidth="2.5" strokeDasharray="8 4" />
            <line x1="320" y1="40" x2="200" y2="30" stroke="url(#rg1)" strokeWidth="2.5" strokeDasharray="8 4" />
            <circle cx="320" cy="40" r="8" fill={theme.purple} />
            <text x="330" y="36" fill={theme.text} fontSize="10">ORX-1042</text>
            <circle cx="200" cy="30" r="8" fill={theme.purple} />
            <text x="210" y="26" fill={theme.text} fontSize="10">ORX-1043</text>
            <text x="250" y="75" fill={theme.purple} fontSize="10" opacity="0.7">← North Route</text>

            {/* Route 2: South */}
            <line x1="400" y1="110" x2="480" y2="170" stroke="url(#rg2)" strokeWidth="2.5" strokeDasharray="8 4" />
            <line x1="480" y1="170" x2="600" y2="185" stroke="url(#rg2)" strokeWidth="2.5" strokeDasharray="8 4" />
            <line x1="600" y1="185" x2="700" y2="200" stroke="url(#rg2)" strokeWidth="2.5" strokeDasharray="8 4" />
            <circle cx="480" cy="170" r="8" fill={theme.gold} />
            <text x="490" y="166" fill={theme.text} fontSize="10">ORX-1044</text>
            <circle cx="600" cy="185" r="8" fill={theme.gold} />
            <text x="610" y="181" fill={theme.text} fontSize="10">ORX-1045</text>
            <circle cx="700" cy="200" r="8" fill={theme.danger} />
            <text x="680" y="214" fill={theme.text} fontSize="10">ORX-1046</text>
            <text x="540" y="155" fill={theme.gold} fontSize="10" opacity="0.7">South Route →</text>

            {/* Route 3: East */}
            <line x1="400" y1="110" x2="580" y2="80" stroke={theme.accent} strokeWidth="2.5" strokeDasharray="8 4" opacity="0.6" />
            <circle cx="580" cy="80" r="8" fill={theme.accent} opacity="0.8" />
            <text x="590" y="76" fill={theme.text} fontSize="10">ORX-1047</text>
            <text x="490" y="70" fill={theme.accent} fontSize="10" opacity="0.7">East Route →</text>

            {/* Rider icons */}
            <text x="355" y="70" fontSize="16">🛵</text>
            <text x="430" y="148" fontSize="16">🛵</text>
            <text x="480" y="96" fontSize="16">🛵</text>
          </svg>
        </div>
      </div>

      {/* Route cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {routeGroups.map((rg, i) => (
          <div key={i} className="card" style={{ borderColor: i === 0 ? theme.purple + "66" : i === 1 ? theme.gold + "66" : theme.accentSoft }}>
            <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 13, marginBottom: 12, color: i === 0 ? theme.purple : i === 1 ? theme.gold : theme.accent }}>
              {rg.direction}
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <div><div style={{ fontSize: 10, color: theme.textMuted }}>Distance</div><div style={{ fontWeight: 600 }}>{rg.distance}</div></div>
              <div><div style={{ fontSize: 10, color: theme.textMuted }}>ETA</div><div style={{ fontWeight: 600 }}>{rg.eta}</div></div>
              <div><div style={{ fontSize: 10, color: theme.textMuted }}>Rider</div><div style={{ fontWeight: 600, fontSize: 12 }}>{rg.rider}</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rg.orders.map(oid => {
                const o = orders.find(x => x.id === oid);
                return o ? (
                  <div key={oid} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: theme.bgCardAlt, borderRadius: 8, fontSize: 12 }}>
                    <span style={{ fontFamily: "monospace", color: theme.accent }}>{oid}</span>
                    <span style={{ color: theme.textMuted }}>{o.customer}</span>
                    <span>{o.distance} km</span>
                  </div>
                ) : null;
              })}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "8px", fontSize: 12 }}>Dispatch</button>
              <button className="btn btn-ghost" style={{ flex: 1, padding: "8px", fontSize: 12 }}>Optimize</button>
            </div>
          </div>
        ))}
      </div>

      {/* Distance table */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 16 }}>Order Distance Matrix</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
              {["Order", "Customer", "Address", "Distance", "Est. Time", "Along Route"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: theme.textMuted, fontWeight: 500, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={o.id} className="table-row">
                <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: theme.accent }}>{o.id}</td>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>{o.customer}</td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: theme.textMuted }}>{o.address}</td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="progress-bar" style={{ width: 60 }}>
                      <div className="progress-fill" style={{ width: `${(o.distance / 8) * 100}%`, background: o.distance < 4 ? theme.accent : o.distance < 6 ? theme.gold : theme.danger }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{o.distance} km</span>
                  </div>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>{Math.round(o.distance * 4)} min</td>
                <td style={{ padding: "10px 12px" }}>
                  {routeGroups.find(rg => rg.orders.includes(o.id))
                    ? <span style={{ fontSize: 11, color: theme.accent, background: theme.accentDim, padding: "2px 8px", borderRadius: 4 }}>✓ Grouped</span>
                    : <span style={{ fontSize: 11, color: theme.textMuted }}>Standalone</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const topMeds = [
    { name: "Paracetamol 500mg", sales: 420, pct: 85 },
    { name: "Metformin 500mg", sales: 310, pct: 63 },
    { name: "Vitamin C 500mg", sales: 280, pct: 57 },
    { name: "Amoxicillin 250mg", sales: 240, pct: 49 },
    { name: "Ibuprofen 400mg", sales: 210, pct: 43 },
  ];

  const hourly = [12, 18, 24, 20, 35, 42, 55, 60, 48, 38, 44, 50];
  const maxH = Math.max(...hourly);

  return (
    <div className="fade-up">
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 22, marginBottom: 20 }}>Analytics</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Hourly orders */}
        <div className="card">
          <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 4 }}>Orders by Hour</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>Today</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 100 }}>
            {hourly.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: `${(v / maxH) * 80}px`, background: i >= 8 ? `linear-gradient(180deg,${theme.accent},${theme.accent}66)` : `${theme.border}`, borderRadius: "3px 3px 1px 1px", minHeight: 3 }} />
                {i % 2 === 0 && <div style={{ fontSize: 9, color: theme.textMuted }}>{i + 8}h</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Top medicines */}
        <div className="card">
          <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 4 }}>Top Medicines</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16 }}>By sales volume this month</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {topMeds.map((m, i) => (
              <div key={m.name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>{m.sales} units</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${m.pct}%`, background: `linear-gradient(90deg,${theme.accent},${theme.purple})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delivery stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[
          { label: "Avg Distance/Delivery", value: "3.8 km", icon: "📏", color: theme.accent },
          { label: "Fuel Saved (Route Opt)", value: "22 km", icon: "⛽", color: theme.gold },
          { label: "On-time Delivery Rate", value: "94%", icon: "⏱", color: theme.purple },
          { label: "Customer Return Rate", value: "78%", icon: "🔄", color: theme.danger },
        ].map(s => (
          <div key={s.label} className="card-alt" style={{ textAlign: "center", border: `1px solid ${s.color}33` }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 22, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CUSTOMER DASHBOARD ───────────────────────────────────────────────────────
function CustomerDashboard({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("home");
  const [cart, setCart] = useState([]);
  const [trackingOrder] = useState(myOrders.find(o => o.status === "transit"));

  const tabs = ["home", "orders", "track", "profile"];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* Header */}
      <header style={{ background: theme.bgCard, borderBottom: `1px solid ${theme.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 18 }}>MediRun</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>📍 Sri Anandpur Sahib, Punjab</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => onNavigate("landing")} style={{ background: "none", border: "none", color: theme.textMuted, cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ position: "relative" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${theme.accent},${theme.purple})`, display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
            {cart.length > 0 && <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: theme.danger, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{cart.length}</div>}
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        {activeTab === "home" && <CustomerHome cart={cart} setCart={setCart} />}
        {activeTab === "orders" && <CustomerOrders />}
        {activeTab === "track" && <CustomerTrack trackingOrder={trackingOrder} />}
        {activeTab === "profile" && <CustomerProfile />}
      </div>

      {/* Bottom Nav */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: theme.bgCard, borderTop: `1px solid ${theme.border}`, padding: "10px 0", display: "flex", justifyContent: "space-around" }}>
        {[["home", "🏠", "Home"], ["orders", "📦", "Orders"], ["track", "📍", "Track"], ["profile", "👤", "Profile"]].map(([id, icon, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 16px" }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 10, color: activeTab === id ? theme.accent : theme.textMuted, fontWeight: activeTab === id ? 600 : 400, fontFamily: "DM Sans" }}>{label}</span>
            {activeTab === id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: theme.accent }} />}
          </button>
        ))}
      </nav>
    </div>
  );
}

function CustomerHome({ cart, setCart }) {
  const meds = [
    { name: "Paracetamol 500mg", brand: "Crocin", price: 28, category: "Pain Relief", icon: "💊" },
    { name: "Vitamin C 500mg", brand: "Limcee", price: 45, category: "Vitamins", icon: "🍊" },
    { name: "Cough Syrup", brand: "Benadryl", price: 90, category: "Cold & Flu", icon: "🫁" },
    { name: "Amoxicillin 250mg", brand: "Mox", price: 72, category: "Antibiotic", icon: "🔬" },
    { name: "Antacid Tablet", brand: "Digene", price: 35, category: "Digestion", icon: "🫃" },
    { name: "Ibuprofen 400mg", brand: "Brufen", price: 42, category: "Pain Relief", icon: "💊" },
  ];

  const inCart = (name) => cart.find(c => c.name === name);
  const toggleCart = (med) => {
    if (inCart(med.name)) setCart(cart.filter(c => c.name !== med.name));
    else setCart([...cart, med]);
  };

  return (
    <div style={{ padding: 20 }} className="fade-up">
      {/* Active order banner */}
      <div style={{ background: `linear-gradient(135deg,${theme.accent}22,${theme.purple}22)`, border: `1px solid ${theme.accentSoft}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: theme.accent, fontWeight: 600, marginBottom: 4 }}>● Live Delivery</div>
            <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 16 }}>ORX-1043 arriving soon</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4 }}>Metformin 500mg · ETA ~8 min</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 22, color: theme.accent }}>~8</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>minutes</div>
          </div>
        </div>
        <div className="progress-bar" style={{ marginTop: 12 }}>
          <div className="progress-fill" style={{ width: "75%", background: `linear-gradient(90deg,${theme.accent},${theme.purple})` }} />
        </div>
      </div>

      {/* Search */}
      <input className="input" placeholder="🔍  Search medicines, brands..." style={{ marginBottom: 20 }} />

      {/* Categories */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {["All", "Pain Relief", "Vitamins", "Antibiotics", "Digestion", "Diabetes"].map(c => (
          <button key={c} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${theme.border}`, background: "none", color: theme.textMuted, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</button>
        ))}
      </div>

      {/* Quick reorder */}
      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>Reorder last time?</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>Paracetamol + Vitamin C</div>
        </div>
        <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}>Reorder</button>
      </div>

      {/* Medicine grid */}
      <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 12 }}>Available Medicines</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {meds.map(m => {
          const added = inCart(m.name);
          return (
            <div key={m.name} className="card" style={{ padding: 14, transition: "border-color .2s", borderColor: added ? theme.accentSoft : theme.border }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{m.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8 }}>{m.brand} · {m.category}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Syne", fontWeight: 700, color: theme.accent }}>₹{m.price}</span>
                <button onClick={() => toggleCart(m)} className={`btn ${added ? "btn-primary" : "btn-ghost"}`} style={{ padding: "5px 12px", fontSize: 12 }}>
                  {added ? "✓ Added" : "+ Add"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 40px)", maxWidth: 440, background: theme.accent, borderRadius: 14, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 8px 32px ${theme.accent}44`, zIndex: 40 }}>
          <span style={{ color: "#0A0F1E", fontWeight: 600 }}>{cart.length} item{cart.length > 1 ? "s" : ""} · ₹{cart.reduce((a, c) => a + c.price, 0)}</span>
          <span style={{ color: "#0A0F1E", fontWeight: 700 }}>Checkout →</span>
        </div>
      )}
    </div>
  );
}

function CustomerOrders() {
  return (
    <div style={{ padding: 20 }} className="fade-up">
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, marginBottom: 16 }}>My Orders</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {myOrders.map(o => (
          <div key={o.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: theme.accent }}>{o.id}</span>
              <span className={`status-pill status-${o.status}`}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                {o.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 8 }}>{o.date}</div>
            <div style={{ marginBottom: 10 }}>
              {o.items.map(i => <div key={i} style={{ fontSize: 13, padding: "3px 0", borderBottom: `1px dashed ${theme.border}` }}>{i}</div>)}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "Syne", fontWeight: 700, color: theme.accent }}>₹{o.total}</span>
              {o.eta && <span style={{ fontSize: 12, color: theme.gold }}>🛵 {o.eta}</span>}
              {o.status === "delivered" && <button className="btn btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }}>Reorder</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerTrack({ trackingOrder }) {
  const progress = 75;

  return (
    <div style={{ padding: 20 }} className="fade-up">
      <h2 style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Live Tracking</h2>
      <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>ORX-1043 · Metformin 500mg</p>

      {/* Map */}
      <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ background: theme.bgCardAlt, padding: 16 }}>
          <svg width="100%" height="160" viewBox="0 0 400 160">
            <defs>
              <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={theme.accent} />
                <stop offset="100%" stopColor={theme.purple} />
              </linearGradient>
            </defs>
            {[30, 60, 90, 120, 150].map(y => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke={theme.border} strokeWidth="1" />)}
            {[80, 160, 240, 320].map(x => <line key={x} x1={x} y1="0" x2={x} y2="160" stroke={theme.border} strokeWidth="1" />)}
            {/* Route */}
            <polyline points="30,120 80,100 140,80 200,70 260,55 320,45 370,50" fill="none" stroke={theme.border} strokeWidth="3" strokeLinecap="round" />
            <polyline points="30,120 80,100 140,80 200,70 260,55" fill="none" stroke="url(#tg)" strokeWidth="3" strokeLinecap="round" />
            {/* Shop */}
            <circle cx="30" cy="120" r="8" fill={theme.accent} />
            <text x="40" y="116" fill={theme.accent} fontSize="11">Shop</text>
            {/* Rider (at 75%) */}
            <text x="248" y="45" fontSize="18">🛵</text>
            {/* Home */}
            <circle cx="370" cy="50" r="8" fill={theme.purple} />
            <text x="350" y="40" fill={theme.purple} fontSize="11">You</text>
            {/* Pulse ring around rider */}
            <circle cx="260" cy="55" r="14" fill="none" stroke={theme.gold} strokeWidth="1.5" opacity="0.5" />
            <circle cx="260" cy="55" r="20" fill="none" stroke={theme.gold} strokeWidth="1" opacity="0.25" />
          </svg>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Rider</div>
            <div style={{ fontWeight: 600 }}>Arjun Singh · 🛵 Hero Splendor</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Away</div>
            <div style={{ fontFamily: "Syne", fontWeight: 700, color: theme.gold }}>1.4 km</div>
          </div>
        </div>
      </div>

      {/* ETA Card */}
      <div style={{ background: `linear-gradient(135deg,${theme.accent}22,${theme.purple}22)`, border: `1px solid ${theme.accentSoft}`, borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 4 }}>Estimated Arrival</div>
        <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 40, color: theme.accent }}>~8 min</div>
        <div className="progress-bar" style={{ marginTop: 12 }}>
          <div className="progress-fill" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${theme.accent},${theme.purple})` }} />
        </div>
        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>75% of route completed</div>
      </div>

      {/* Tracking steps */}
      <div className="card">
        <div style={{ fontFamily: "Syne", fontWeight: 700, marginBottom: 16 }}>Order Journey</div>
        {trackSteps.map((step, i) => (
          <div key={step.label} style={{ display: "flex", gap: 12, marginBottom: i < trackSteps.length - 1 ? 0 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: step.done ? theme.accent : theme.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: step.done ? "#0A0F1E" : theme.textMuted, flexShrink: 0, fontWeight: 700 }}>
                {step.done ? "✓" : i + 1}
              </div>
              {i < trackSteps.length - 1 && <div style={{ width: 2, height: 28, background: step.done ? theme.accent + "66" : theme.border, margin: "4px 0" }} />}
            </div>
            <div style={{ paddingBottom: i < trackSteps.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 14, fontWeight: step.done ? 600 : 400, color: step.done ? theme.text : theme.textMuted }}>{step.label}</div>
              <div style={{ fontSize: 11, color: theme.accent }}>{step.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerProfile() {
  return (
    <div style={{ padding: 20 }} className="fade-up">
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg,${theme.accent},${theme.purple})`, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>👤</div>
        <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 20 }}>Priya Sharma</div>
        <div style={{ color: theme.textMuted, fontSize: 13 }}>📍 Sri Anandpur Sahib, Punjab</div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 14 }}>
          {[["12", "Orders"], ["4.9★", "Rating"], ["₹8,420", "Spent"]].map(([v, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Syne", fontWeight: 700, color: theme.accent }}>{v}</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {[
        { icon: "🏠", label: "Saved Addresses", sub: "Model Town · Civil Lines" },
        { icon: "💊", label: "My Prescriptions", sub: "3 uploaded" },
        { icon: "🔔", label: "Refill Reminders", sub: "Metformin due in 5 days" },
        { icon: "💳", label: "Payment Methods", sub: "UPI · Cash on Delivery" },
        { icon: "📞", label: "Pharmacist Support", sub: "Available 9AM–9PM" },
      ].map(item => (
        <div key={item.label} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = theme.accentSoft}
          onMouseLeave={e => e.currentTarget.style.borderColor = theme.border}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{item.sub}</div>
            </div>
          </div>
          <span style={{ color: theme.textMuted, fontSize: 18 }}>›</span>
        </div>
      ))}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("landing");

  return (
    <>
      <style>{css}</style>
      {view === "landing" && <LandingPage onNavigate={setView} />}
      {view === "admin" && <AdminDashboard onNavigate={setView} />}
      {view === "customer" && <CustomerDashboard onNavigate={setView} />}
    </>
  );
}
