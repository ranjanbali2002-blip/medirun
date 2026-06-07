import { useState, useEffect, useRef, useCallback } from "react";
import { sendOTP } from "./src/firebase.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const UPI_ID        = "ranjanbali2002-1@okhdfcbank"; // ← change to your UPI ID
const UPI_NAME      = "MediRun Pharmacy";
const SHOP          = { lat: 31.3618, lon: 76.4941 };
const MAX_DELIVERY_KM = 5; // delivery restricted to 5 km from shop
const API           = import.meta.env.VITE_API_URL || "";

// ─── Utilities ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dL = (lat2-lat1)*Math.PI/180, dG = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dG/2)**2;
  return +(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))).toFixed(1);
}
function deliveryFee(km) {
  if(!km||km<=0) return 0; if(km<=2) return 20; if(km<=4) return 30; if(km<=6) return 45; return 60;
}
function upiLink(amount, orderId) {
  return `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent("MediRun-"+orderId)}`;
}
function qrUrl(link) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}&color=00D4AA&bgcolor=0F1729&margin=10`;
}

function useGeoDistance(address) {
  const [s, set] = useState({ loading:false, km:null, fee:null, lat:null, lon:null, error:null });
  useEffect(() => {
    if (!address || address.trim().length < 4) { set({ loading:false,km:null,fee:null,lat:null,lon:null,error:null }); return; }
    set(v => ({ ...v, loading:true, error:null }));
    const t = setTimeout(async () => {
      try {
        const q = encodeURIComponent(address+", Punjab, India");
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,{headers:{"Accept-Language":"en"}});
        const data = await res.json();
        if (!data[0]) throw new Error("Address not found — try a more specific location");
        const lat = +data[0].lat, lon = +data[0].lon;
        const km = haversine(SHOP.lat,SHOP.lon,lat,lon);
        set({ loading:false, km, fee:deliveryFee(km), lat, lon, error:null });
      } catch(e) { set({ loading:false,km:null,fee:null,lat:null,lon:null, error:e.message }); }
    }, 700);
    return () => clearTimeout(t);
  }, [address]);
  return s;
}

// ─── Cloudinary prescription upload ──────────────────────────────────────────
const CLOUDINARY_CLOUD  = import.meta.env.VITE_CLOUDINARY_CLOUD  || "";
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_PRESET || "";

async function uploadPrescription(file) {
  if (!CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) {
    // Fallback: base64 (works but large)
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);
  form.append("folder", "medirun/prescriptions");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method:"POST", body:form });
  const data = await res.json();
  if (!data.secure_url) throw new Error("Upload failed");
  return data.secure_url;
}

// ─── Browser push notifications (free, no API key) ────────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function sendBrowserNotification(title, body, onClick) {
  if (Notification.permission !== "granted") return;
  const n = new Notification(title, {
    body,
    icon: "https://emojicdn.elk.sh/💊",
    badge: "https://emojicdn.elk.sh/💊",
  });
  if (onClick) n.onclick = onClick;
}

// ─── Live Map (Leaflet + OpenStreetMap, completely free) ──────────────────────
function LiveMap({ shopLat, shopLon, riderLat, riderLon, destLat, destLon }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const riderMarker  = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !window.L) return;
    if (mapRef.current) return; // already initialised

    const L = window.L;
    // Fix default marker icons broken by bundlers
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current, { zoomControl:false, attributionControl:false })
      .setView([shopLat, shopLon], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Shop marker
    const shopIcon = L.divIcon({ html:"<div style='font-size:22px;'>💊</div>", className:"", iconAnchor:[11,22] });
    L.marker([shopLat, shopLon], { icon:shopIcon }).addTo(map).bindPopup("MediRun Shop");

    // Destination marker
    if (destLat && destLon) {
      const destIcon = L.divIcon({ html:"<div style='font-size:22px;'>🏠</div>", className:"", iconAnchor:[11,22] });
      L.marker([destLat, destLon], { icon:destIcon }).addTo(map).bindPopup("Your Location");
    }

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update rider marker whenever position changes
  useEffect(() => {
    if (!mapRef.current || !window.L || !riderLat || !riderLon) return;
    const L = window.L;
    const riderIcon = L.divIcon({ html:"<div style='font-size:22px;'>🛵</div>", className:"", iconAnchor:[11,22] });
    if (riderMarker.current) {
      riderMarker.current.setLatLng([riderLat, riderLon]);
    } else {
      riderMarker.current = L.marker([riderLat, riderLon], { icon:riderIcon })
        .addTo(mapRef.current).bindPopup("Rider");
    }
    mapRef.current.panTo([riderLat, riderLon], { animate:true, duration:1 });
  }, [riderLat, riderLon]);

  return <div ref={containerRef} style={{ width:"100%", height:200 }} />;
}

async function apiCall(path, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  try {
    const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
    return await res.json();
  } catch { return null; }
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const theme = {
  bg:"#0A0F1E", bgCard:"#0F1729", bgCardAlt:"#131D35",
  accent:"#00D4AA", accentDim:"#00D4AA22", accentSoft:"#00D4AA44",
  gold:"#F5A623", danger:"#FF4D6D", purple:"#7B61FF",
  text:"#E8EEF8", textMuted:"#6B7A9A", textDim:"#3D4E72",
  border:"#1E2D4E", borderLight:"#253354",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:${theme.bg}; color:${theme.text}; font-family:'DM Sans',sans-serif; }
  ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:${theme.bg}} ::-webkit-scrollbar-thumb{background:${theme.border};border-radius:3px}
  @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  @keyframes routeLine{from{stroke-dashoffset:400}to{stroke-dashoffset:0}}
  .fade-up{animation:fadeUp .5s ease both} .fade-up-2{animation:fadeUp .5s ease .1s both} .fade-up-3{animation:fadeUp .5s ease .2s both}
  .float{animation:float 3s ease-in-out infinite}
  .nav-tab{cursor:pointer;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:500;color:${theme.textMuted};transition:all .2s;border:none;background:none}
  .nav-tab:hover{color:${theme.text};background:${theme.accentDim}} .nav-tab.active{color:${theme.accent};background:${theme.accentDim}}
  .card{background:${theme.bgCard};border:1px solid ${theme.border};border-radius:16px;padding:20px}
  .card-alt{background:${theme.bgCardAlt};border:1px solid ${theme.borderLight};border-radius:12px;padding:16px}
  .btn{cursor:pointer;border:none;border-radius:10px;padding:10px 20px;font-family:'DM Sans',sans-serif;font-weight:500;font-size:14px;transition:all .2s}
  .btn-primary{background:${theme.accent};color:#0A0F1E} .btn-primary:hover{background:#00FFCC;transform:translateY(-1px);box-shadow:0 6px 24px #00D4AA44}
  .btn-primary:disabled{background:${theme.textDim};color:${theme.textMuted};cursor:not-allowed;transform:none;box-shadow:none}
  .btn-ghost{background:transparent;color:${theme.text};border:1px solid ${theme.border}} .btn-ghost:hover{border-color:${theme.accent};color:${theme.accent}}
  .btn-danger{background:${theme.danger}22;color:${theme.danger};border:1px solid ${theme.danger}44}
  .btn-gold{background:${theme.gold}22;color:${theme.gold};border:1px solid ${theme.gold}44}
  .status-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500}
  .status-delivered,.status-confirmed{background:#00D4AA22;color:${theme.accent}}
  .status-transit{background:#F5A62322;color:${theme.gold}}
  .status-pending{background:#7B61FF22;color:${theme.purple}}
  .status-cancelled,.status-payment_failed{background:#FF4D6D22;color:${theme.danger}}
  .status-pending_verification{background:#F5A62322;color:${theme.gold}}
  .metric-card{background:${theme.bgCard};border:1px solid ${theme.border};border-radius:16px;padding:20px;position:relative;overflow:hidden}
  .metric-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .metric-card.green::before{background:linear-gradient(90deg,transparent,${theme.accent},transparent)}
  .metric-card.gold::before{background:linear-gradient(90deg,transparent,${theme.gold},transparent)}
  .metric-card.purple::before{background:linear-gradient(90deg,transparent,${theme.purple},transparent)}
  .metric-card.red::before{background:linear-gradient(90deg,transparent,${theme.danger},transparent)}
  .input{background:${theme.bgCardAlt};border:1px solid ${theme.border};border-radius:10px;padding:10px 14px;color:${theme.text};font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;transition:border .2s}
  .input:focus{border-color:${theme.accent}} .input::placeholder{color:${theme.textMuted}}
  .table-row{border-bottom:1px solid ${theme.border}} .table-row:hover{background:${theme.accentDim}} .table-row:last-child{border-bottom:none}
  .progress-bar{height:6px;background:${theme.border};border-radius:3px;overflow:hidden}
  .progress-fill{height:100%;border-radius:3px;transition:width 1s ease}
  .otp-input{background:${theme.bgCardAlt};border:1px solid ${theme.border};border-radius:12px;padding:16px;color:${theme.text};font-size:28px;font-family:'Syne',sans-serif;font-weight:700;text-align:center;width:100%;outline:none;transition:border .2s;letter-spacing:12px}
  .otp-input:focus{border-color:${theme.accent}}
  .modal-backdrop{position:fixed;inset:0;background:#000000aa;z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:20px}
  .modal{background:${theme.bgCard};border:1px solid ${theme.border};border-radius:20px 20px 20px 20px;padding:24px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto}
`;

// ─── Mock fallback data ────────────────────────────────────────────────────────
const mockOrders = [
  { id:"ORX-1042", customer:"Priya Sharma", address:"Kiratpur Sahib, Sri Anandpur Sahib", delivery_distance:2.4, items:3, total:840, delivery_fee:20, status:"delivered", payment_status:"paid", created_at: new Date().toISOString(), medicines:["Paracetamol 500mg","Vitamin C","Cough Syrup"] },
  { id:"ORX-1043", customer:"Rajesh Kumar",  address:"Nangal Rd, Sri Anandpur Sahib",       delivery_distance:4.1, items:5, total:1250,delivery_fee:30, status:"transit",   payment_status:"paid", created_at: new Date().toISOString(), medicines:["Metformin 500mg","BP Tablet","Antacid"] },
  { id:"ORX-1044", customer:"Anita Verma",   address:"Gurdwara Chowk, Sri Anandpur Sahib",  delivery_distance:3.7, items:2, total:420, delivery_fee:30, status:"transit",   payment_status:"paid", created_at: new Date().toISOString(), medicines:["Amoxicillin","Ibuprofen"] },
  { id:"ORX-1045", customer:"Sunil Mehta",   address:"Keshgarh Sahib Rd",                   delivery_distance:5.2, items:7, total:2100,delivery_fee:45, status:"pending",   payment_status:"pending_verification", created_at: new Date().toISOString(), medicines:["Insulin","Glucometer Strips"], requires_prescription:true, prescription_status:"pending" },
  { id:"ORX-1046", customer:"Deepika Singh", address:"Rupnagar Rd",                         delivery_distance:6.8, items:4, total:990, delivery_fee:60, status:"pending",   payment_status:"unpaid", created_at: new Date().toISOString(), medicines:["Thyroid Med","Calcium D3"] },
];
const mockMedicines = [
  { id:1, name:"Paracetamol 500mg", brand:"Crocin",    price:28, category:"Pain Relief",  icon:"💊", stock:150, requires_prescription:false },
  { id:2, name:"Vitamin C 500mg",   brand:"Limcee",    price:45, category:"Vitamins",      icon:"🍊", stock:200, requires_prescription:false },
  { id:3, name:"Cough Syrup",       brand:"Benadryl",  price:90, category:"Cold & Flu",   icon:"🫁", stock:80,  requires_prescription:false },
  { id:4, name:"Amoxicillin 250mg", brand:"Mox",       price:72, category:"Antibiotic",   icon:"🔬", stock:60,  requires_prescription:true  },
  { id:5, name:"Antacid Tablet",    brand:"Digene",    price:35, category:"Digestion",    icon:"🫃", stock:120, requires_prescription:false },
  { id:6, name:"Ibuprofen 400mg",   brand:"Brufen",    price:42, category:"Pain Relief",  icon:"💊", stock:100, requires_prescription:false },
  { id:7, name:"Metformin 500mg",   brand:"Glycomet",  price:38, category:"Diabetes",     icon:"💉", stock:90,  requires_prescription:true  },
  { id:8, name:"Cetirizine 10mg",   brand:"Cetzine",   price:22, category:"Allergy",      icon:"🌿", stock:110, requires_prescription:false },
];
const mockRiders = [
  { id:1, name:"Arjun Singh",  vehicle:"Hero Splendor", available:true,  active_orders:2, today_deliveries:5 },
  { id:2, name:"Vikram Rao",   vehicle:"Honda Activa",  available:true,  active_orders:1, today_deliveries:3 },
  { id:3, name:"Mohit Dev",    vehicle:"TVS Jupiter",   available:false, active_orders:0, today_deliveries:7 },
];
const mockRiderOrders = [
  { id:"ORX-1043", customer_name:"Rajesh Kumar", customer_phone:"9812345678", delivery_address:"Nangal Rd, Sri Anandpur Sahib", delivery_distance:4.1, total:1250, delivery_fee:30, status:"transit", medicines:["Metformin 500mg","BP Tablet"] },
  { id:"ORX-1044", customer_name:"Anita Verma",  customer_phone:"9876543210", delivery_address:"Gurdwara Chowk",                delivery_distance:3.7, total:420,  delivery_fee:30, status:"confirmed", medicines:["Amoxicillin","Ibuprofen"] },
];

// ─── Shared components ────────────────────────────────────────────────────────
function Spinner() {
  return <span style={{ display:"inline-block", animation:"spin 1s linear infinite", fontSize:16 }}>⏳</span>;
}

function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:"currentColor" }} />
      {status.replace(/_/g," ")}
    </span>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background:"none", border:"none", color:theme.textMuted, cursor:"pointer", fontSize:18, padding:"4px 0" }}>←</button>
  );
}

// ─── AUTH (Firebase Phone OTP) ───────────────────────────────────────────────
function AuthScreen({ onLogin, onBack }) {
  const [step, setStep]         = useState("phone");
  const [phone, setPhone]       = useState("");
  const [otp, setOtp]           = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const confirmationRef         = useRef(null);

  const handleSendOTP = async () => {
    if (phone.length < 10) return setError("Enter a valid 10-digit phone number");
    setLoading(true); setError("");
    try {
      // Special numbers bypass Firebase and go through our backend (admin/rider)
      const isSpecial = ["0000000000","8888888888","7777777777","6666666666"].includes(phone);
      if (isSpecial) {
        await apiCall("/api/auth/send-otp", { method:"POST", body:JSON.stringify({ phone }) });
        confirmationRef.current = null; // use backend verify
      } else {
        // Real Firebase SMS
        const confirmation = await sendOTP("+91" + phone, "send-otp-btn");
        confirmationRef.current = confirmation;
      }
      setStep("otp");
    } catch (e) {
      setError(e.message || "Failed to send OTP. Try again.");
      // Reset reCAPTCHA on error
      if (window._recaptchaVerifier) {
        window._recaptchaVerifier.clear();
        window._recaptchaVerifier = null;
      }
    }
    setLoading(false);
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return setError("Enter 6-digit OTP");
    setLoading(true); setError("");
    try {
      if (confirmationRef.current) {
        // Firebase verification for real customers
        const result = await confirmationRef.current.confirm(otp);
        const firebaseToken = await result.user.getIdToken();
        // Exchange Firebase token for our app JWT
        const data = await apiCall("/api/auth/firebase-login", {
          method: "POST",
          body: JSON.stringify({ firebaseToken, phone })
        });
        if (data?.token) { onLogin(data.user, data.token); return; }
        // Fallback: create customer session with Firebase data
        onLogin({ id: result.user.uid, name: "Customer", phone, role: "customer" }, firebaseToken);
      } else {
        // Backend OTP for special accounts (admin/rider)
        const data = await apiCall("/api/auth/verify-otp", { method:"POST", body:JSON.stringify({ phone, code:otp }) });
        if (data?.token) { onLogin(data.user, data.token); return; }
        // Demo fallback
        if (otp === "123456") {
          const role  = phone === "0000000000" ? "admin" : "rider";
          const names = { "0000000000":"Admin","8888888888":"Arjun Singh","7777777777":"Vikram Rao","6666666666":"Mohit Dev" };
          onLogin({ id:1, name:names[phone]||"Rider", phone, role }, "demo-token");
        } else { setError("Invalid OTP"); }
      }
    } catch (e) {
      setError(e.code === "auth/invalid-verification-code" ? "Wrong OTP — check your SMS" : e.message || "Verification failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:64, height:64, borderRadius:18, background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, margin:"0 auto 16px" }}>💊</div>
          <div style={{ fontFamily:"Syne", fontWeight:800, fontSize:26 }}>MediRun</div>
          <div style={{ color:theme.textMuted, fontSize:14, marginTop:6 }}>
            {step === "phone" ? "Enter your mobile number to continue" : `OTP sent to +91 ${phone}`}
          </div>
        </div>

        <div className="card">
          {step === "phone" ? (
            <>
              <div style={{ fontSize:11, color:theme.textMuted, marginBottom:8, letterSpacing:1 }}>MOBILE NUMBER</div>
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <div style={{ background:theme.bgCardAlt, border:`1px solid ${theme.border}`, borderRadius:10, padding:"10px 14px", color:theme.textMuted, fontSize:14, whiteSpace:"nowrap" }}>🇮🇳 +91</div>
                <input className="input" placeholder="10-digit number" value={phone}
                  onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))}
                  onKeyDown={e=>e.key==="Enter"&&handleSendOTP()} style={{ flex:1 }} />
              </div>
              {error && <div style={{ color:theme.danger, fontSize:12, marginBottom:12 }}>{error}</div>}
              {/* reCAPTCHA attaches to this button invisibly */}
              <button id="send-otp-btn" className="btn btn-primary" style={{ width:"100%", padding:14 }} onClick={handleSendOTP} disabled={loading}>
                {loading ? <Spinner/> : "Send OTP →"}
              </button>
              <div style={{ marginTop:16, padding:12, background:theme.bgCardAlt, borderRadius:10, fontSize:12, color:theme.textMuted }}>
                <div style={{ fontWeight:600, color:theme.text, marginBottom:4 }}>Special accounts (OTP: 123456)</div>
                <div>Admin: <span style={{ color:theme.accent }}>0000000000</span> · Rider: <span style={{ color:theme.gold }}>8888888888</span></div>
                <div style={{ marginTop:4, color:theme.textDim }}>All other numbers receive a real SMS</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize:11, color:theme.textMuted, marginBottom:8, letterSpacing:1 }}>ENTER OTP</div>
              <div style={{ fontSize:13, color:theme.accent, textAlign:"center", marginBottom:12 }}>
                📱 Real SMS sent to +91 {phone}
              </div>
              <input className="otp-input" placeholder="——————" maxLength={6} value={otp}
                onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))}
                onKeyDown={e=>e.key==="Enter"&&handleVerifyOTP()} style={{ marginBottom:8 }} />
              {error && <div style={{ color:theme.danger, fontSize:12, marginBottom:8 }}>{error}</div>}
              <button className="btn btn-primary" style={{ width:"100%", padding:14, marginBottom:10 }} onClick={handleVerifyOTP} disabled={loading}>
                {loading ? <Spinner/> : "Verify & Login →"}
              </button>
              <button className="btn btn-ghost" style={{ width:"100%", padding:10 }} onClick={()=>{setStep("phone");setOtp("");setError("");confirmationRef.current=null;}}>
                ← Change Number
              </button>
            </>
          )}
        </div>
        <button onClick={onBack} style={{ display:"block", margin:"16px auto 0", background:"none", border:"none", color:theme.textMuted, cursor:"pointer", fontSize:13 }}>← Back to home</button>
      </div>
    </div>
  );
}

// ─── UPI PAYMENT ──────────────────────────────────────────────────────────────
function UPIPayment({ amount, orderId, token, onPaid, onClose }) {
  const [utrRef, setUtrRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const link = upiLink(amount, orderId);
  const qr   = qrUrl(link);

  const confirm = async () => {
    setLoading(true);
    await apiCall("/api/payments", { method:"POST", body:JSON.stringify({ order_id:orderId, amount, utr_ref:utrRef||"DEMO-"+Date.now() }) }, token);
    setDone(true);
    setLoading(false);
    setTimeout(() => onPaid(), 1500);
  };

  if (done) return (
    <div style={{ textAlign:"center", padding:32 }}>
      <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
      <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:20 }}>Payment Submitted!</div>
      <div style={{ color:theme.textMuted, marginTop:8 }}>Admin will verify and confirm your order shortly.</div>
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <span style={{ fontFamily:"Syne", fontWeight:700, fontSize:18 }}>Pay ₹{amount}</span>
        <button onClick={onClose} style={{ background:"none", border:"none", color:theme.textMuted, cursor:"pointer", fontSize:20 }}>✕</button>
      </div>

      {/* QR Code */}
      <div style={{ textAlign:"center", background:theme.bgCardAlt, borderRadius:16, padding:20, marginBottom:16 }}>
        <img src={qr} alt="UPI QR" style={{ width:200, height:200, borderRadius:12 }} onError={e=>e.target.style.display="none"} />
        <div style={{ marginTop:12, fontFamily:"Syne", fontWeight:700, fontSize:16, color:theme.accent }}>{UPI_ID}</div>
        <div style={{ fontSize:12, color:theme.textMuted, marginTop:4 }}>{UPI_NAME}</div>
      </div>

      {/* Mobile UPI button */}
      <a href={link} style={{ display:"block", textDecoration:"none" }}>
        <button className="btn btn-primary" style={{ width:"100%", padding:14, marginBottom:12, fontSize:15 }}>
          📱 Open UPI App (GPay / PhonePe / Paytm)
        </button>
      </a>

      <div style={{ display:"flex", alignItems:"center", gap:10, margin:"12px 0", color:theme.textMuted, fontSize:12 }}>
        <div style={{ flex:1, height:1, background:theme.border }} /> OR enter transaction ref <div style={{ flex:1, height:1, background:theme.border }} />
      </div>

      <input className="input" placeholder="UTR / Transaction ID (optional)" value={utrRef} onChange={e=>setUtrRef(e.target.value)} style={{ marginBottom:12 }} />

      <button className="btn btn-primary" style={{ width:"100%", padding:14 }} onClick={confirm} disabled={loading}>
        {loading ? <Spinner/> : "I've Paid — Confirm Order ✓"}
      </button>

      <div style={{ marginTop:12, fontSize:11, color:theme.textMuted, textAlign:"center" }}>
        Your order will be confirmed after admin verifies the payment
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ user, onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const features = [
    { icon:"💊", title:"Prescription Upload",  desc:"Upload your prescription and we'll pick & pack your medicines instantly." },
    { icon:"🚀", title:"Express Delivery",      desc:"Get medicines at your door in under 30 minutes from our local pharmacy." },
    { icon:"📍", title:"Live Tracking",         desc:"Watch your rider move in real-time on a live map from shop to doorstep." },
    { icon:"💳", title:"UPI Payments",          desc:"Pay directly via GPay, PhonePe or Paytm — no card details needed." },
    { icon:"🔒", title:"Verified Medicines",    desc:"Every medicine sourced directly from licensed suppliers with batch verification." },
    { icon:"🔔", title:"Smart Refills",         desc:"Never run out. Auto-reminders and one-tap reorder for your regular meds." },
  ];

  return (
    <div style={{ minHeight:"100vh", overflowX:"hidden" }}>
      <nav style={{ position:"sticky", top:0, zIndex:100, background:scrolled?`${theme.bg}ee`:"transparent", backdropFilter:scrolled?"blur(20px)":"none", borderBottom:scrolled?`1px solid ${theme.border}`:"none", padding:"16px 40px", display:"flex", alignItems:"center", justifyContent:"space-between", transition:"all .3s" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>💊</div>
          <span style={{ fontFamily:"Syne", fontWeight:800, fontSize:20 }}>MediRun</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {user ? (
            <>
              <button className="btn btn-ghost" onClick={()=>onNavigate(user.role==="admin"?"admin":user.role==="rider"?"rider":"customer")} style={{ fontSize:13 }}>Dashboard →</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={()=>onNavigate("login")} style={{ fontSize:13 }}>Login</button>
              <button className="btn btn-primary" onClick={()=>onNavigate("login")} style={{ fontSize:13 }}>Order Now</button>
            </>
          )}
        </div>
      </nav>

      <section style={{ padding:"80px 40px 60px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-100, left:"50%", transform:"translateX(-50%)", width:600, height:600, borderRadius:"50%", background:`radial-gradient(circle,${theme.accent}15,transparent 70%)`, pointerEvents:"none" }} />
        <div className="fade-up" style={{ display:"inline-flex", alignItems:"center", gap:8, background:theme.accentDim, border:`1px solid ${theme.accentSoft}`, borderRadius:20, padding:"6px 16px", fontSize:13, color:theme.accent, marginBottom:24 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:theme.accent, animation:"pulse 1.5s infinite" }} /> Now delivering in Sri Anandpur Sahib — 30 min or free
        </div>
        <h1 className="fade-up-2" style={{ fontFamily:"Syne", fontWeight:800, fontSize:"clamp(36px,6vw,72px)", lineHeight:1.1, maxWidth:700, margin:"0 auto 20px" }}>
          Your pharmacy,<br/><span style={{ color:theme.accent }}>at your door</span><br/>in 30 minutes.
        </h1>
        <p className="fade-up-3" style={{ color:theme.textMuted, fontSize:18, maxWidth:480, margin:"0 auto 40px", lineHeight:1.7 }}>
          Order medicines online from MediRun and track every step of your delivery — live.
        </p>
        <div className="fade-up-3" style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
          <button className="btn btn-primary" onClick={()=>onNavigate("login")} style={{ padding:"14px 32px", fontSize:16 }}>Order Medicines →</button>
          <button className="btn btn-ghost" onClick={()=>onNavigate("login")} style={{ padding:"14px 32px", fontSize:16 }}>Pharmacy Login</button>
        </div>
        <div style={{ display:"flex", gap:16, justifyContent:"center", marginTop:60, flexWrap:"wrap" }}>
          {[["12,400+","Orders Delivered"],["4.9★","Average Rating"],["28 min","Avg Delivery"],["100%","Licensed Meds"]].map(([val,label])=>(
            <div key={label} className="card" style={{ textAlign:"center", padding:"16px 24px", minWidth:120 }}>
              <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:22, color:theme.accent }}>{val}</div>
              <div style={{ fontSize:12, color:theme.textMuted, marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding:"40px 40px 80px" }}>
        <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:36, textAlign:"center", marginBottom:8 }}>Everything you need</h2>
        <p style={{ color:theme.textMuted, textAlign:"center", marginBottom:48 }}>Healthcare delivery, reimagined.</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:16, maxWidth:900, margin:"0 auto" }}>
          {features.map(f=>(
            <div key={f.title} className="card" style={{ transition:"transform .2s,border-color .2s", cursor:"default" }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.borderColor=theme.accentSoft}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.borderColor=theme.border}}>
              <div style={{ fontSize:28, marginBottom:12 }}>{f.icon}</div>
              <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:16, marginBottom:8 }}>{f.title}</div>
              <div style={{ color:theme.textMuted, fontSize:14, lineHeight:1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── CUSTOMER APP ─────────────────────────────────────────────────────────────
function CustomerDashboard({ user, token, onNavigate, onLogout }) {
  const [tab, setTab] = useState("home");
  const [cart, setCart] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto", position:"relative" }}>
      <header style={{ background:theme.bgCard, borderBottom:`1px solid ${theme.border}`, padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div>
          <div style={{ fontFamily:"Syne", fontWeight:800, fontSize:18 }}>MediRun</div>
          <div style={{ fontSize:12, color:theme.textMuted }}>📍 Sri Anandpur Sahib, Punjab</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <BackBtn onClick={()=>onNavigate("landing")} />
          <div style={{ position:"relative" }}>
            <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>👤</div>
            {cart.length > 0 && <div style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:"50%", background:theme.danger, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700 }}>{cart.length}</div>}
          </div>
        </div>
      </header>

      <div style={{ flex:1, overflowY:"auto", paddingBottom:80 }}>
        {tab === "home"    && <CustomerHome cart={cart} setCart={setCart} token={token} setShowPayment={setShowPayment} setCurrentOrder={setCurrentOrder} />}
        {tab === "orders"  && <CustomerOrders token={token} user={user} />}
        {tab === "track"   && <CustomerTrack token={token} currentOrder={currentOrder} />}
        {tab === "profile" && <CustomerProfile user={user} token={token} onLogout={onLogout} />}
      </div>

      {showPayment && currentOrder && (
        <div className="modal-backdrop">
          <div className="modal">
            <UPIPayment amount={currentOrder.total} orderId={currentOrder.id} token={token}
              onPaid={()=>{ setShowPayment(false); setTab("orders"); }}
              onClose={()=>setShowPayment(false)} />
          </div>
        </div>
      )}

      <nav style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:theme.bgCard, borderTop:`1px solid ${theme.border}`, padding:"10px 0", display:"flex", justifyContent:"space-around" }}>
        {[["home","🏠","Home"],["orders","📦","Orders"],["track","📍","Track"],["profile","👤","Profile"]].map(([id,icon,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"4px 16px" }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            <span style={{ fontSize:10, color:tab===id?theme.accent:theme.textMuted, fontWeight:tab===id?600:400, fontFamily:"DM Sans" }}>{label}</span>
            {tab===id && <div style={{ width:4, height:4, borderRadius:"50%", background:theme.accent }} />}
          </button>
        ))}
      </nav>
    </div>
  );
}

function CustomerHome({ cart, setCart, token, setShowPayment, setCurrentOrder }) {
  const [medicines, setMedicines] = useState(mockMedicines);
  const [address, setAddress]     = useState("");
  const [prescription, setPrescription] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [placing, setPlacing]     = useState(false);
  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("All");
  const geo = useGeoDistance(address);

  useEffect(() => {
    apiCall("/api/inventory").then(d => d && setMedicines(d));
  }, []);

  const cats = ["All", ...Array.from(new Set(medicines.map(m=>m.category)))];
  const filtered = medicines.filter(m => {
    const matchCat  = category === "All" || m.category === category;
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.brand?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const inCart = name => cart.find(c=>c.name===name);
  const toggleCart = med => {
    if (inCart(med.name)) setCart(cart.filter(c=>c.name!==med.name));
    else setCart([...cart,med]);
  };

  const needsPrescription = cart.some(m=>m.requires_prescription);
  const subtotal = cart.reduce((a,c)=>a+c.price,0);
  const total    = subtotal + (geo.fee||0);

  const [prescriptionUploading, setPrescriptionUploading] = useState(false);
  const handlePrescription = async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large. Max 10MB."); return; }
    setPrescriptionUploading(true);
    try {
      const url = await uploadPrescription(file);
      setPrescription(url);
    } catch {
      alert("Upload failed. Try again.");
    }
    setPrescriptionUploading(false);
  };

  const placeOrder = async () => {
    if (!address || !geo.km) return;
    setPlacing(true);
    const orderData = {
      medicines: cart.map(m=>({ name:m.name, price:m.price, qty:1 })),
      total, delivery_fee: geo.fee, delivery_address: address,
      delivery_lat: geo.lat, delivery_lon: geo.lon,
      delivery_distance: geo.km,
      requires_prescription: needsPrescription,
      prescription_data: prescription || null,
    };
    const data = await apiCall("/api/orders", { method:"POST", body:JSON.stringify(orderData) }, token);
    const orderId = data?.id || ("ORX-" + Math.floor(1000+Math.random()*9000));
    setCurrentOrder({ id:orderId, total, delivery_distance: geo.km });
    setCart([]);
    setShowCheckout(false);
    setPlacing(false);
    setShowPayment(true);
    // Ask for notification permission so we can alert on delivery updates
    requestNotificationPermission();
  };

  return (
    <div style={{ padding:20 }} className="fade-up">
      {/* Search */}
      <input className="input" placeholder="🔍  Search medicines, brands..." value={search} onChange={e=>setSearch(e.target.value)} style={{ marginBottom:14 }} />

      {/* Categories */}
      <div style={{ display:"flex", gap:8, marginBottom:16, overflowX:"auto", paddingBottom:4 }}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCategory(c)} style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${category===c?theme.accent:theme.border}`, background:category===c?theme.accentDim:"none", color:category===c?theme.accent:theme.textMuted, fontSize:12, cursor:"pointer", whiteSpace:"nowrap" }}>{c}</button>
        ))}
      </div>

      {/* Medicine grid */}
      <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:12 }}>
        {filtered.length} Medicines Available
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:80 }}>
        {filtered.map(m=>{
          const added = inCart(m.name);
          const outOfStock = m.stock <= 0;
          return (
            <div key={m.name} className="card" style={{ padding:14, transition:"border-color .2s", borderColor:added?theme.accentSoft:theme.border, opacity:outOfStock?0.5:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                <span style={{ fontSize:28 }}>{m.icon}</span>
                {m.requires_prescription && <span style={{ fontSize:10, background:`${theme.gold}22`, color:theme.gold, padding:"2px 6px", borderRadius:6, border:`1px solid ${theme.gold}44` }}>Rx</span>}
              </div>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{m.name}</div>
              <div style={{ fontSize:11, color:theme.textMuted, marginBottom:6 }}>{m.brand} · {m.category}</div>
              <div style={{ fontSize:11, color:m.stock<20?theme.danger:theme.textMuted, marginBottom:8 }}>
                {outOfStock ? "Out of stock" : `${m.stock} in stock`}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>₹{m.price}</span>
                <button onClick={()=>!outOfStock&&toggleCart(m)} className={`btn ${added?"btn-primary":"btn-ghost"}`} style={{ padding:"5px 12px", fontSize:12 }} disabled={outOfStock}>
                  {added ? "✓ Added" : "+ Add"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && !showCheckout && (
        <div onClick={()=>setShowCheckout(true)} style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 40px)", maxWidth:440, background:theme.accent, borderRadius:14, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", boxShadow:`0 8px 32px ${theme.accent}44`, zIndex:40, cursor:"pointer" }}>
          <span style={{ color:"#0A0F1E", fontWeight:600 }}>{cart.length} item{cart.length>1?"s":""} · ₹{subtotal}</span>
          <span style={{ color:"#0A0F1E", fontWeight:700 }}>Checkout →</span>
        </div>
      )}

      {/* Checkout panel */}
      {cart.length > 0 && showCheckout && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 40px)", maxWidth:440, background:theme.bgCard, border:`1px solid ${theme.accentSoft}`, borderRadius:18, padding:16, boxShadow:`0 8px 40px #00000066`, zIndex:40, maxHeight:"70vh", overflowY:"auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <span style={{ fontFamily:"Syne", fontWeight:700, fontSize:16 }}>Checkout</span>
            <button onClick={()=>setShowCheckout(false)} style={{ background:"none", border:"none", color:theme.textMuted, cursor:"pointer", fontSize:20 }}>✕</button>
          </div>

          {/* Address */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:theme.textMuted, marginBottom:6 }}>DELIVERY ADDRESS</div>
            <input className="input" placeholder="e.g. Kiratpur Sahib, near bus stand" value={address} onChange={e=>setAddress(e.target.value)} style={{ fontSize:13 }} />
          </div>

          {geo.loading && <div style={{ fontSize:12, color:theme.textMuted, marginBottom:8, display:"flex", gap:6, alignItems:"center" }}><Spinner/> Calculating distance…</div>}
          {geo.error   && <div style={{ fontSize:12, color:theme.danger, padding:"6px 10px", background:`${theme.danger}15`, borderRadius:8, marginBottom:8 }}>{geo.error}</div>}
          {geo.km > MAX_DELIVERY_KM && (
            <div style={{ fontSize:13, color:theme.danger, padding:"10px 14px", background:`${theme.danger}15`, border:`1px solid ${theme.danger}44`, borderRadius:10, marginBottom:8 }}>
              📍 Sorry, your address is <strong>{geo.km} km</strong> away. We currently deliver within <strong>{MAX_DELIVERY_KM} km</strong> of our shop in Sri Anandpur Sahib only.
            </div>
          )}
          {geo.km && geo.km <= MAX_DELIVERY_KM && (
            <div style={{ background:theme.bgCardAlt, borderRadius:10, padding:"10px 12px", marginBottom:10, display:"flex", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:16 }}>
                <div><div style={{ fontSize:10, color:theme.textMuted }}>DISTANCE</div><div style={{ fontFamily:"Syne", fontWeight:700, color:theme.gold }}>{geo.km} km</div></div>
                <div><div style={{ fontSize:10, color:theme.textMuted }}>DELIVERY</div><div style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>₹{geo.fee}</div></div>
                <div><div style={{ fontSize:10, color:theme.textMuted }}>EST. TIME</div><div style={{ fontFamily:"Syne", fontWeight:700 }}>{Math.round(geo.km*4+5)} min</div></div>
              </div>
              <div style={{ fontSize:10, color:theme.textMuted, textAlign:"right" }}>📍 From shop<br/>Sri Anandpur Sahib</div>
            </div>
          )}

          {/* Prescription upload if needed */}
          {needsPrescription && (
            <div style={{ marginBottom:10, padding:12, background:`${theme.gold}15`, border:`1px solid ${theme.gold}44`, borderRadius:10 }}>
              <div style={{ fontSize:12, color:theme.gold, fontWeight:600, marginBottom:6 }}>⚕️ Prescription Required</div>
              <div style={{ fontSize:11, color:theme.textMuted, marginBottom:8 }}>One or more medicines in your cart require a valid prescription.</div>
              <label style={{ display:"block", padding:"8px 14px", background:theme.bgCardAlt, border:`1px dashed ${theme.gold}66`, borderRadius:8, textAlign:"center", cursor:"pointer", fontSize:12, color:prescription?theme.accent:theme.textMuted }}>
                {prescriptionUploading ? <><Spinner/> Uploading…</> : prescription ? "✓ Prescription uploaded to cloud" : "📎 Upload Prescription (Photo/PDF)"}
                <input type="file" accept="image/*,application/pdf" onChange={handlePrescription} style={{ display:"none" }} disabled={prescriptionUploading} />
              </label>
              {prescription && prescription.startsWith("http") && (
                <a href={prescription} target="_blank" rel="noreferrer" style={{ display:"block", textAlign:"center", fontSize:11, color:theme.accent, marginTop:4 }}>View uploaded file ↗</a>
              )}
            </div>
          )}

          {/* Fee tiers */}
          <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
            <div style={{ fontSize:10, padding:"3px 8px", background:`${theme.accent}18`, border:`1px solid ${theme.accentSoft}`, borderRadius:6, color:theme.accent }}>📍 Max delivery: {MAX_DELIVERY_KM} km</div>
            {[["0–2km","₹20"],["2–4km","₹30"],["4–5km","₹45"]].map(([r,f])=>(
              <div key={r} style={{ fontSize:10, padding:"3px 8px", background:theme.bgCardAlt, borderRadius:6, color:theme.textMuted }}>{r} → <span style={{ color:theme.accent }}>{f}</span></div>
            ))}
          </div>

          {/* Summary */}
          <div style={{ borderTop:`1px solid ${theme.border}`, paddingTop:10, marginBottom:12 }}>
            {cart.map(m=>(
              <div key={m.name} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:theme.textMuted, marginBottom:4 }}>
                <span>{m.name}</span><span>₹{m.price}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginTop:6 }}>
              <span style={{ color:theme.textMuted }}>Delivery fee</span>
              <span style={{ color:geo.km?theme.accent:theme.textMuted }}>{geo.km?`₹${geo.fee}`:"Enter address"}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"Syne", fontWeight:700, fontSize:15, marginTop:6 }}>
              <span>Total</span><span style={{ color:theme.accent }}>₹{total}</span>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width:"100%", padding:12 }}
            onClick={placeOrder}
            disabled={!geo.km || geo.km > MAX_DELIVERY_KM || (needsPrescription && !prescription) || placing}>
            {placing ? <Spinner/>
              : !geo.km                              ? "Enter address to continue"
              : geo.km > MAX_DELIVERY_KM             ? `Outside delivery zone (${geo.km} km > ${MAX_DELIVERY_KM} km)`
              : needsPrescription && !prescription   ? "Upload prescription to continue"
              : `Pay ₹${total} via UPI →`}
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerOrders({ token, user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall("/api/orders", {}, token).then(d => {
      setOrders(d || [{ id:"ORX-1042", medicines:["Paracetamol 500mg","Vitamin C"], total:840, delivery_fee:20, status:"delivered", payment_status:"paid", created_at:new Date().toISOString() }]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding:40, textAlign:"center" }}><Spinner/></div>;

  return (
    <div style={{ padding:20 }} className="fade-up">
      <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:20, marginBottom:16 }}>My Orders</h2>
      {orders.length === 0 && <div style={{ textAlign:"center", color:theme.textMuted, padding:40 }}>No orders yet</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {orders.map(o=>(
          <div key={o.id} className="card">
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontFamily:"monospace", fontSize:13, color:theme.accent }}>{o.id}</span>
              <StatusPill status={o.status} />
            </div>
            <div style={{ fontSize:12, color:theme.textMuted, marginBottom:8 }}>{new Date(o.created_at).toLocaleString("en-IN")}</div>
            {o.medicines?.filter(Boolean).map(m=>(
              <div key={m} style={{ fontSize:13, padding:"3px 0", borderBottom:`1px dashed ${theme.border}` }}>{m}</div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
              <div>
                <span style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>₹{o.total}</span>
                <span style={{ fontSize:11, color:theme.textMuted, marginLeft:8 }}>+ ₹{o.delivery_fee} delivery</span>
              </div>
              <StatusPill status={o.payment_status||"unpaid"} />
            </div>
            {o.requires_prescription && (
              <div style={{ marginTop:8, fontSize:11, color:theme.gold }}>
                ⚕️ Prescription: {o.prescription_status||"pending review"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomerTrack({ token, currentOrder }) {
  const [order, setOrder]     = useState(null);
  const [riderPos, setRiderPos] = useState(null);
  const prevStatus = useRef(null);

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if (!currentOrder?.id) return;
    const fetch_ = () => apiCall(`/api/orders/${currentOrder.id}`,{},token).then(d=>{
      if (!d?.id) return;
      setOrder(d);
      if (d.rider_lat) setRiderPos({ lat:+d.rider_lat, lon:+d.rider_lon });
      // Fire browser notification when status changes
      if (prevStatus.current && prevStatus.current !== d.status) {
        const msgs = {
          confirmed: "✅ Order confirmed! Pharmacist is packing your medicines.",
          transit:   "🛵 Your rider is on the way! Check your delivery OTP.",
          delivered: "📦 Delivered! Enjoy your medicines.",
        };
        if (msgs[d.status]) sendBrowserNotification("MediRun", msgs[d.status]);
      }
      prevStatus.current = d.status;
    });
    fetch_();
    const iv = setInterval(fetch_, 5000);
    return () => clearInterval(iv);
  }, [currentOrder]);

  const trackSteps = [
    { label:"Order Placed",        done:true },
    { label:"Pharmacist Reviewing", done:order?.status !== "pending" },
    { label:"Packed & Ready",       done:["confirmed","transit","delivered"].includes(order?.status) },
    { label:"Out for Delivery",     done:["transit","delivered"].includes(order?.status) },
    { label:"Delivered",            done:order?.status === "delivered" },
  ];

  return (
    <div style={{ padding:20 }} className="fade-up">
      <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:20, marginBottom:4 }}>Live Tracking</h2>
      {!currentOrder ? (
        <div style={{ textAlign:"center", color:theme.textMuted, padding:40 }}>No active order to track</div>
      ) : (
        <>
          <p style={{ fontSize:13, color:theme.textMuted, marginBottom:16 }}>{currentOrder.id}</p>
          {/* Live Map */}
          <div style={{ background:theme.bgCard, border:`1px solid ${theme.border}`, borderRadius:16, overflow:"hidden", marginBottom:16 }}>
            <LiveMap
              shopLat={SHOP.lat} shopLon={SHOP.lon}
              riderLat={riderPos?.lat} riderLon={riderPos?.lon}
              destLat={order?.delivery_lat ? +order.delivery_lat : null}
              destLon={order?.delivery_lon ? +order.delivery_lon : null}
            />
            <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:12, color:theme.textMuted }}>Rider</div>
                <div style={{ fontWeight:600 }}>{order?.rider_name || "Assigning…"}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:12, color:theme.textMuted }}>Status</div>
                <StatusPill status={order?.status||"pending"}/>
              </div>
            </div>
            {riderPos && (
              <div style={{ padding:"8px 16px", background:theme.bgCardAlt, display:"flex", alignItems:"center", gap:8, borderTop:`1px solid ${theme.border}` }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:theme.accent, animation:"pulse 1.5s infinite", flexShrink:0 }} />
                <span style={{ fontSize:12, color:theme.accent }}>Live GPS — rider location updating every 5s</span>
              </div>
            )}
          </div>

          {/* ETA */}
          <div style={{ background:`linear-gradient(135deg,${theme.accent}22,${theme.purple}22)`, border:`1px solid ${theme.accentSoft}`, borderRadius:16, padding:20, marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:13, color:theme.textMuted, marginBottom:4 }}>Estimated Arrival</div>
            <div style={{ fontFamily:"Syne", fontWeight:800, fontSize:40, color:theme.accent }}>~{Math.round((currentOrder.delivery_distance||3)*4+5)} min</div>
          </div>

          {/* Delivery OTP — show only when rider is on the way */}
          {order?.delivery_otp && order?.status !== "delivered" && (
            <div style={{ background:`linear-gradient(135deg,${theme.gold}18,${theme.gold}08)`, border:`2px solid ${theme.gold}66`, borderRadius:16, padding:20, marginBottom:16, textAlign:"center" }}>
              <div style={{ fontSize:12, color:theme.gold, fontWeight:600, letterSpacing:1, marginBottom:8 }}>🔐 DELIVERY OTP — Show this to your rider</div>
              <div style={{ fontFamily:"Syne", fontWeight:800, fontSize:52, color:theme.gold, letterSpacing:12 }}>{order.delivery_otp}</div>
              <div style={{ fontSize:12, color:theme.textMuted, marginTop:8 }}>Rider will enter this code to confirm delivery</div>
            </div>
          )}

          {/* Steps */}
          <div className="card">
            <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:16 }}>Order Journey</div>
            {trackSteps.map((s,i)=>(
              <div key={s.label} style={{ display:"flex", gap:12 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:s.done?theme.accent:theme.border, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:s.done?"#0A0F1E":theme.textMuted, flexShrink:0, fontWeight:700 }}>
                    {s.done?"✓":i+1}
                  </div>
                  {i < trackSteps.length-1 && <div style={{ width:2, height:28, background:s.done?theme.accent+"66":theme.border, margin:"4px 0" }}/>}
                </div>
                <div style={{ paddingBottom:i<trackSteps.length-1?16:0 }}>
                  <div style={{ fontSize:14, fontWeight:s.done?600:400, color:s.done?theme.text:theme.textMuted }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CustomerProfile({ user, token, onLogout }) {
  const [name, setName] = useState(user?.name||"");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    await apiCall("/api/auth/profile", { method:"PATCH", body:JSON.stringify({ name }) }, token);
    setSaved(true); setTimeout(()=>setSaved(false), 2000);
  };

  return (
    <div style={{ padding:20 }} className="fade-up">
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ width:72, height:72, borderRadius:"50%", background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, margin:"0 auto 12px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30 }}>👤</div>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} style={{ textAlign:"center", fontFamily:"Syne", fontWeight:700, fontSize:18, background:"transparent", border:"none", marginBottom:4 }} />
        <div style={{ color:theme.textMuted, fontSize:13 }}>📞 +91 {user?.phone}</div>
        <div style={{ color:theme.textMuted, fontSize:13 }}>📍 Sri Anandpur Sahib, Punjab</div>
        <button className="btn btn-ghost" onClick={save} style={{ marginTop:10, padding:"6px 16px", fontSize:12 }}>
          {saved ? "✓ Saved" : "Save Name"}
        </button>
      </div>

      {[
        { icon:"💳", label:"Payment Method",     sub:`UPI: ${UPI_ID}` },
        { icon:"💊", label:"My Prescriptions",   sub:"Upload in checkout" },
        { icon:"🔔", label:"Refill Reminders",   sub:"Coming soon" },
        { icon:"📞", label:"Pharmacist Support", sub:"Available 9AM–9PM" },
      ].map(item=>(
        <div key={item.label} className="card" style={{ marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=theme.accentSoft}
          onMouseLeave={e=>e.currentTarget.style.borderColor=theme.border}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20 }}>{item.icon}</span>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>{item.label}</div>
              <div style={{ fontSize:12, color:theme.textMuted }}>{item.sub}</div>
            </div>
          </div>
          <span style={{ color:theme.textMuted, fontSize:18 }}>›</span>
        </div>
      ))}

      <button className="btn btn-danger" onClick={onLogout} style={{ width:"100%", marginTop:16, padding:12 }}>Sign Out</button>
    </div>
  );
}

// ─── RIDER APP ────────────────────────────────────────────────────────────────
function RiderApp({ user, token, onNavigate, onLogout }) {
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState(mockRiderOrders);
  const [tracking, setTracking] = useState(false);
  const [available, setAvailable] = useState(true);
  const watchRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    const data = await apiCall("/api/riders/my-orders", {}, token);
    if (data?.length >= 0) setOrders(data);
  }, [token]);

  useEffect(() => { fetchOrders(); const iv=setInterval(fetchOrders,10000); return()=>clearInterval(iv); }, []);

  const startGPS = () => {
    if (!navigator.geolocation) return alert("Geolocation not supported");
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        apiCall("/api/riders/location", { method:"POST", body:JSON.stringify({ lat:pos.coords.latitude, lon:pos.coords.longitude }) }, token);
      },
      null,
      { enableHighAccuracy:true, timeout:5000, maximumAge:0 }
    );
    setTracking(true);
  };

  const stopGPS = () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    setTracking(false);
  };

  const toggleAvailable = async () => {
    const next = !available;
    setAvailable(next);
    await apiCall("/api/riders/availability", { method:"PATCH", body:JSON.stringify({ available:next }) }, token);
  };

  const [otpInput, setOtpInput] = useState({});
  const [otpError, setOtpError] = useState({});
  const [otpLoading, setOtpLoading] = useState({});

  const updateStatus = async (orderId, status) => {
    await apiCall(`/api/orders/${orderId}/status`, { method:"PATCH", body:JSON.stringify({ status }) }, token);
    setOrders(prev => prev.map(o => o.id===orderId ? {...o,status} : o).filter(o=>o.status!=="delivered"));
  };

  const confirmDelivery = async (orderId) => {
    const otp = otpInput[orderId];
    if (!otp || otp.length !== 4) { setOtpError(e=>({...e,[orderId]:"Enter 4-digit OTP"})); return; }
    setOtpLoading(l=>({...l,[orderId]:true}));
    setOtpError(e=>({...e,[orderId]:""}));
    const data = await apiCall(`/api/orders/${orderId}/verify-delivery`, { method:"POST", body:JSON.stringify({ otp }) }, token);
    if (data?.status === "delivered") {
      setOrders(prev => prev.filter(o => o.id !== orderId));
    } else {
      setOtpError(e=>({...e,[orderId]: data?.error || "Wrong OTP — ask customer again"}));
    }
    setOtpLoading(l=>({...l,[orderId]:false}));
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <header style={{ background:theme.bgCard, borderBottom:`1px solid ${theme.border}`, padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <BackBtn onClick={()=>onNavigate("landing")} />
          <div style={{ width:28, height:28, borderRadius:7, background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🛵</div>
          <div>
            <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:15 }}>{user?.name}</div>
            <div style={{ fontSize:11, color:theme.textMuted }}>Rider · {user?.phone}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={toggleAvailable} className={`btn ${available?"btn-primary":"btn-ghost"}`} style={{ padding:"6px 12px", fontSize:12 }}>
            {available ? "🟢 Online" : "🔴 Offline"}
          </button>
          <button onClick={tracking?stopGPS:startGPS} className={`btn ${tracking?"btn-danger":"btn-ghost"}`} style={{ padding:"6px 12px", fontSize:12 }}>
            {tracking ? "📍 GPS On" : "📍 Share GPS"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background:theme.bgCard, borderBottom:`1px solid ${theme.border}`, display:"flex", padding:"0 20px", gap:4 }}>
        {[["orders","📦 My Orders"],["earnings","💰 Earnings"]].map(([id,label])=>(
          <button key={id} className={`nav-tab ${tab===id?"active":""}`} onClick={()=>setTab(id)} style={{ padding:"12px 16px", fontSize:13 }}>{label}</button>
        ))}
      </div>

      <div style={{ flex:1, padding:20, overflowY:"auto" }}>
        {tab === "orders" && (
          <div>
            {tracking && (
              <div style={{ background:`${theme.accent}15`, border:`1px solid ${theme.accentSoft}`, borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:theme.accent, animation:"pulse 1.5s infinite", flexShrink:0 }} />
                <span style={{ fontSize:13, color:theme.accent }}>GPS active — your location is being shared with customers</span>
              </div>
            )}
            {orders.length === 0 && (
              <div style={{ textAlign:"center", padding:40, color:theme.textMuted }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🛵</div>
                No orders assigned right now
              </div>
            )}
            {orders.map(o=>(
              <div key={o.id} className="card" style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontFamily:"monospace", color:theme.accent, fontSize:13 }}>{o.id}</span>
                  <StatusPill status={o.status} />
                </div>
                <div style={{ fontFamily:"Syne", fontWeight:600, fontSize:15, marginBottom:4 }}>{o.customer_name}</div>
                <div style={{ fontSize:13, color:theme.textMuted, marginBottom:4 }}>📞 {o.customer_phone}</div>
                <div style={{ fontSize:13, color:theme.textMuted, marginBottom:10 }}>📍 {o.delivery_address}</div>
                <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                  {o.medicines?.filter(Boolean).map(m=>(
                    <span key={m} style={{ fontSize:11, padding:"2px 8px", background:theme.bgCardAlt, borderRadius:6, color:theme.text }}>{m}</span>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div><span style={{ fontFamily:"Syne", fontWeight:700, fontSize:18, color:theme.accent }}>₹{o.total}</span><span style={{ fontSize:11, color:theme.textMuted, marginLeft:6 }}>+ ₹{o.delivery_fee} delivery</span></div>
                  <div style={{ fontSize:12, color:theme.textMuted }}>📏 {o.delivery_distance} km</div>
                </div>
                {/* Navigation link */}
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.delivery_address+", Punjab")}`} target="_blank" rel="noreferrer" style={{ textDecoration:"none", display:"block", marginBottom:8 }}>
                  <button className="btn btn-ghost" style={{ width:"100%", padding:8, fontSize:12 }}>🗺️ Open in Google Maps</button>
                </a>
                <div style={{ display:"flex", gap:8 }}>
                  {o.status === "confirmed" && (
                    <button className="btn btn-primary" style={{ flex:1, padding:8, fontSize:12 }} onClick={()=>updateStatus(o.id,"transit")}>
                      🛵 Start Delivery
                    </button>
                  )}
                  {o.status === "transit" && (
                    <div style={{ width:"100%" }}>
                      <div style={{ fontSize:11, color:theme.gold, fontWeight:600, marginBottom:6 }}>🔐 Ask customer for their OTP</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <input
                          className="input"
                          placeholder="Enter 4-digit OTP"
                          maxLength={4}
                          value={otpInput[o.id]||""}
                          onChange={e=>setOtpInput(v=>({...v,[o.id]:e.target.value.replace(/\D/g,"").slice(0,4)}))}
                          style={{ flex:1, fontSize:20, fontFamily:"Syne", fontWeight:700, textAlign:"center", letterSpacing:8, padding:"8px" }}
                        />
                        <button className="btn btn-primary" style={{ padding:"8px 16px", fontSize:13 }} onClick={()=>confirmDelivery(o.id)} disabled={otpLoading[o.id]}>
                          {otpLoading[o.id] ? <Spinner/> : "✓"}
                        </button>
                      </div>
                      {otpError[o.id] && <div style={{ fontSize:12, color:theme.danger, marginTop:6 }}>{otpError[o.id]}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "earnings" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              {[
                { label:"Today's Deliveries", value:"5", icon:"🛵", color:theme.accent },
                { label:"Today's Earnings",   value:"₹250", icon:"💰", color:theme.gold },
                { label:"This Week",          value:"₹1,450", icon:"📅", color:theme.purple },
                { label:"Total Deliveries",   value:"143",   icon:"✓", color:theme.accent },
              ].map(s=>(
                <div key={s.label} className="card" style={{ textAlign:"center", border:`1px solid ${s.color}33` }}>
                  <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
                  <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:20, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:theme.textMuted, marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:14 }}>Earning Structure</div>
              {[["Per delivery (0–3km)","₹25"],["Per delivery (3–6km)","₹35"],["Per delivery (6km+)","₹50"],["Bonus (10+ deliveries/day)","₹100"]].map(([label,val])=>(
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${theme.border}` }}>
                  <span style={{ fontSize:14 }}>{label}</span>
                  <span style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:"12px 20px", background:theme.bgCard, borderTop:`1px solid ${theme.border}` }}>
        <button className="btn btn-danger" onClick={onLogout} style={{ width:"100%", padding:10, fontSize:13 }}>Sign Out</button>
      </div>
    </div>
  );
}

// ─── ADMIN APP ────────────────────────────────────────────────────────────────
function AdminDashboard({ user, token, onNavigate, onLogout }) {
  const [tab, setTab] = useState("overview");
  const tabs = ["overview","orders","inventory","riders","delivery","analytics"];
  const [pendingCount, setPendingCount] = useState(0);
  const prevPending = useRef(0);

  useEffect(() => {
    requestNotificationPermission();
    const poll = async () => {
      const data = await apiCall("/api/orders", {}, token);
      if (!data) return;
      const count = data.filter(o => o.status === "pending").length;
      setPendingCount(count);
      if (count > prevPending.current) {
        sendBrowserNotification("MediRun Admin", `🆕 ${count - prevPending.current} new order(s) waiting for review`);
      }
      prevPending.current = count;
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <header style={{ background:theme.bgCard, borderBottom:`1px solid ${theme.border}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <BackBtn onClick={()=>onNavigate("landing")} />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:7, background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>💊</div>
            <span style={{ fontFamily:"Syne", fontWeight:700 }}>MediRun</span>
            <span style={{ fontSize:11, color:theme.textMuted, background:theme.bgCardAlt, padding:"2px 8px", borderRadius:4, border:`1px solid ${theme.border}` }}>Admin</span>
          </div>
          <div style={{ height:20, width:1, background:theme.border }} />
          {tabs.map(t=>(
            <button key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={()=>setTab(t)} style={{ padding:"8px 14px", fontSize:12 }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:13, color:theme.textMuted }}>👤 {user?.name}</span>
          {/* Notification bell */}
          <div style={{ position:"relative", cursor:"pointer" }} onClick={()=>setTab("orders")}>
            <span style={{ fontSize:20 }}>🔔</span>
            {pendingCount > 0 && (
              <div style={{ position:"absolute", top:-4, right:-4, width:18, height:18, borderRadius:"50%", background:theme.danger, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff" }}>
                {pendingCount}
              </div>
            )}
          </div>
          <button className="btn btn-danger" onClick={onLogout} style={{ padding:"6px 12px", fontSize:12 }}>Sign Out</button>
        </div>
      </header>

      <div style={{ flex:1, padding:24, overflowY:"auto" }}>
        {tab==="overview"  && <AdminOverview token={token} />}
        {tab==="orders"    && <AdminOrders token={token} />}
        {tab==="inventory" && <AdminInventory token={token} />}
        {tab==="riders"    && <AdminRiders token={token} />}
        {tab==="delivery"  && <AdminDelivery />}
        {tab==="analytics" && <AdminAnalytics />}
      </div>
    </div>
  );
}

function AdminOverview({ token }) {
  const [orders, setOrders] = useState(mockOrders);
  const weeklySales = [180,240,195,310,280,420,390];
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const maxSale = Math.max(...weeklySales);

  useEffect(() => { apiCall("/api/orders",{},token).then(d=>d&&setOrders(d)); }, []);

  const revenue = orders.reduce((a,o)=>a+(+o.total||0),0);
  const pending  = orders.filter(o=>o.status==="pending").length;

  const metrics = [
    { label:"Today's Revenue",    value:`₹${revenue.toLocaleString("en-IN")}`, sub:"+12% vs yesterday", color:"green", icon:"💰" },
    { label:"Total Orders",       value:orders.length,                          sub:`${pending} pending`, color:"purple", icon:"📦" },
    { label:"Avg Delivery Time",  value:"26 min",                               sub:"−3 min this week",  color:"gold",   icon:"⚡" },
    { label:"Pending Payments",   value:orders.filter(o=>o.payment_status==="pending_verification").length, sub:"Needs verification", color:"red", icon:"💳" },
  ];

  return (
    <div className="fade-up">
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:"Syne", fontWeight:700, fontSize:24 }}>Good afternoon, {token??"Admin"} 👋</h1>
        <p style={{ color:theme.textMuted, fontSize:14, marginTop:4 }}>Here's what's happening at MediRun today.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {metrics.map(m=>(
          <div key={m.label} className={`metric-card ${m.color}`}>
            <div style={{ fontSize:24, marginBottom:8 }}>{m.icon}</div>
            <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:26, marginBottom:4 }}>{m.value}</div>
            <div style={{ fontSize:13, color:theme.textMuted, marginBottom:6 }}>{m.label}</div>
            <div style={{ fontSize:12, color:theme.accent }}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
        <div className="card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <span style={{ fontFamily:"Syne", fontWeight:700 }}>Recent Orders</span>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ borderBottom:`1px solid ${theme.border}` }}>
              {["Order","Customer","Distance","Total","Payment","Status"].map(h=>(
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:11, color:theme.textMuted, fontWeight:500, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {orders.slice(0,6).map(o=>(
                <tr key={o.id} className="table-row">
                  <td style={{ padding:"10px", fontSize:13, fontFamily:"monospace", color:theme.accent }}>{o.id}</td>
                  <td style={{ padding:"10px", fontSize:13 }}>{o.customer||o.customer_name||"—"}</td>
                  <td style={{ padding:"10px", fontSize:13, color:theme.textMuted }}>{o.delivery_distance||o.distance||"—"} km</td>
                  <td style={{ padding:"10px", fontSize:13, fontWeight:600 }}>₹{o.total}</td>
                  <td style={{ padding:"10px" }}><StatusPill status={o.payment_status||"unpaid"}/></td>
                  <td style={{ padding:"10px" }}><StatusPill status={o.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:4 }}>Weekly Sales</div>
          <div style={{ fontSize:12, color:theme.textMuted, marginBottom:20 }}>Revenue this week</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:120 }}>
            {weeklySales.map((s,i)=>(
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                <div style={{ fontSize:10, color:theme.textMuted }}>₹{s}</div>
                <div style={{ width:"100%", height:`${(s/maxSale)*90}px`, background:`linear-gradient(180deg,${theme.accent},${theme.accent}88)`, borderRadius:"4px 4px 2px 2px", minHeight:4 }} />
                <div style={{ fontSize:10, color:theme.textMuted }}>{days[i]}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:16, padding:12, background:theme.bgCardAlt, borderRadius:8, display:"flex", justifyContent:"space-between" }}>
            <div><div style={{ fontSize:11, color:theme.textMuted }}>Total</div><div style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>₹{weeklySales.reduce((a,b)=>a+b,0).toLocaleString()}</div></div>
            <div style={{ textAlign:"right" }}><div style={{ fontSize:11, color:theme.textMuted }}>Best Day</div><div style={{ fontFamily:"Syne", fontWeight:700 }}>Sat ₹{Math.max(...weeklySales)}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminOrders({ token }) {
  const [orders, setOrders] = useState(mockOrders);
  const [filter, setFilter] = useState("all");
  const [riders, setRiders] = useState(mockRiders);
  const [assigning, setAssigning] = useState(null);

  const load = () => {
    apiCall("/api/orders",{},token).then(d=>d&&setOrders(d));
    apiCall("/api/riders",{},token).then(d=>d&&setRiders(d));
  };
  useEffect(load,[]);

  const filtered = filter==="all" ? orders : orders.filter(o=>o.status===filter);

  const assignRider = async (orderId, riderId) => {
    await apiCall(`/api/orders/${orderId}/assign-rider`,{method:"PATCH",body:JSON.stringify({rider_id:riderId})},token);
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,status:"transit",rider_id:riderId}:o));
    setAssigning(null);
  };

  const approvePrescription = async (orderId, status) => {
    await apiCall(`/api/orders/${orderId}/prescription`,{method:"PATCH",body:JSON.stringify({prescription_status:status})},token);
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,prescription_status:status}:o));
  };

  const verifyPayment = async (orderId) => {
    const payment = await apiCall("/api/payments/pending",{},token);
    const p = payment?.find(p=>p.order_id===orderId);
    if(p) await apiCall(`/api/payments/${p.id}/verify`,{method:"PATCH",body:JSON.stringify({status:"paid"})},token);
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,payment_status:"paid",status:"confirmed"}:o));
  };

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:22 }}>All Orders</h2>
        <div style={{ display:"flex", gap:8 }}>
          {["all","pending","transit","delivered","confirmed"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} className={`nav-tab ${filter===f?"active":""}`} style={{ padding:"6px 12px", fontSize:11 }}>
              {f==="all"?"All":f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {filtered.map(o=>(
          <div key={o.id} className="card">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:16, alignItems:"start" }}>
              {/* Col 1: Customer */}
              <div>
                <div style={{ fontFamily:"monospace", fontSize:12, color:theme.accent, marginBottom:4 }}>{o.id}</div>
                <div style={{ fontFamily:"Syne", fontWeight:600, fontSize:14 }}>{o.customer||o.customer_name||"Customer"}</div>
                <div style={{ fontSize:11, color:theme.textMuted, marginTop:2 }}>📍 {o.delivery_address||o.address}</div>
                <div style={{ fontSize:11, color:theme.textMuted }}>📏 {o.delivery_distance||o.distance} km · 🛵 ₹{deliveryFee(o.delivery_distance||o.distance)}</div>
              </div>
              {/* Col 2: Medicines */}
              <div>
                <div style={{ fontSize:11, color:theme.textMuted, marginBottom:6 }}>Medicines ({o.items} items)</div>
                {o.medicines?.filter(Boolean).map(m=>(
                  <div key={m} style={{ fontSize:11, color:theme.text, padding:"2px 6px", background:theme.bgCardAlt, borderRadius:4, display:"inline-block", margin:"2px 3px 2px 0" }}>{m}</div>
                ))}
              </div>
              {/* Col 3: Finance */}
              <div>
                <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:18, marginBottom:4 }}>₹{o.total}</div>
                <StatusPill status={o.payment_status||"unpaid"} />
                {o.payment_status === "pending_verification" && (
                  <button className="btn btn-primary" style={{ padding:"4px 10px", fontSize:11, marginTop:6, display:"block" }} onClick={()=>verifyPayment(o.id)}>
                    ✓ Verify Payment
                  </button>
                )}
              </div>
              {/* Col 4: Actions */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                <StatusPill status={o.status} />
                {o.requires_prescription && o.prescription_status === "pending" && (
                  <div style={{ display:"flex", gap:4 }}>
                    <button className="btn btn-primary" style={{ padding:"4px 8px", fontSize:11 }} onClick={()=>approvePrescription(o.id,"approved")}>✓ Rx</button>
                    <button className="btn btn-danger"  style={{ padding:"4px 8px", fontSize:11 }} onClick={()=>approvePrescription(o.id,"rejected")}>✗ Rx</button>
                  </div>
                )}
                {o.requires_prescription && o.prescription_data && (
                  <a href={o.prescription_data} target="_blank" rel="noreferrer">
                    <button className="btn btn-ghost" style={{ padding:"4px 8px", fontSize:11 }}>📄 View Rx</button>
                  </a>
                )}
                {(o.status==="pending"||o.status==="confirmed") && o.payment_status!=="unpaid" && (
                  assigning===o.id ? (
                    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      <select onChange={e=>e.target.value&&assignRider(o.id,+e.target.value)} style={{ background:theme.bgCardAlt, border:`1px solid ${theme.border}`, borderRadius:8, padding:"4px 8px", color:theme.text, fontSize:12 }}>
                        <option value="">Select rider</option>
                        {riders.filter(r=>r.available).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button className="btn btn-ghost" style={{ padding:"4px 8px", fontSize:11 }} onClick={()=>setAssigning(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-primary" style={{ padding:"5px 10px", fontSize:11 }} onClick={()=>setAssigning(o.id)}>
                      🛵 Assign Rider
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminInventory({ token }) {
  const [medicines, setMedicines] = useState(mockMedicines);
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState({});

  useEffect(() => { apiCall("/api/inventory",{},token).then(d=>d&&setMedicines(d)); }, []);

  const save = async (id) => {
    const data = await apiCall(`/api/inventory/${id}`,{method:"PATCH",body:JSON.stringify(editVal)},token);
    setMedicines(prev=>prev.map(m=>m.id===id?{...m,...(data||editVal)}:m));
    setEditing(null);
  };

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:22 }}>Inventory</h2>
        <div style={{ fontSize:13, color:theme.textMuted }}>{medicines.filter(m=>m.stock<20).length} low stock items</div>
      </div>
      <div className="card" style={{ padding:0, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ borderBottom:`1px solid ${theme.border}`, background:theme.bgCardAlt }}>
            {["Medicine","Brand","Category","Price","Stock","Rx Required","Actions"].map(h=>(
              <th key={h} style={{ padding:"12px 14px", textAlign:"left", fontSize:11, color:theme.textMuted, fontWeight:500, textTransform:"uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {medicines.map(m=>(
              <tr key={m.id} className="table-row">
                <td style={{ padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span>{m.icon}</span>
                    <span style={{ fontWeight:600, fontSize:14 }}>{m.name}</span>
                  </div>
                </td>
                <td style={{ padding:"12px 14px", fontSize:13, color:theme.textMuted }}>{m.brand}</td>
                <td style={{ padding:"12px 14px", fontSize:13 }}>{m.category}</td>
                <td style={{ padding:"12px 14px" }}>
                  {editing===m.id ? (
                    <input type="number" className="input" style={{ width:70, padding:"4px 8px", fontSize:13 }} defaultValue={m.price} onChange={e=>setEditVal(v=>({...v,price:+e.target.value}))} />
                  ) : (
                    <span style={{ fontFamily:"Syne", fontWeight:700, color:theme.accent }}>₹{m.price}</span>
                  )}
                </td>
                <td style={{ padding:"12px 14px" }}>
                  {editing===m.id ? (
                    <input type="number" className="input" style={{ width:80, padding:"4px 8px", fontSize:13 }} defaultValue={m.stock} onChange={e=>setEditVal(v=>({...v,stock:+e.target.value}))} />
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div className="progress-bar" style={{ width:50 }}>
                        <div className="progress-fill" style={{ width:`${Math.min(100,(m.stock/200)*100)}%`, background:m.stock<20?theme.danger:m.stock<50?theme.gold:theme.accent }} />
                      </div>
                      <span style={{ fontSize:13, color:m.stock<20?theme.danger:theme.text, fontWeight:m.stock<20?700:400 }}>{m.stock}</span>
                    </div>
                  )}
                </td>
                <td style={{ padding:"12px 14px" }}>
                  <span style={{ fontSize:12, color:m.requires_prescription?theme.gold:theme.textMuted }}>
                    {m.requires_prescription ? "⚕️ Yes" : "No"}
                  </span>
                </td>
                <td style={{ padding:"12px 14px" }}>
                  {editing===m.id ? (
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="btn btn-primary" style={{ padding:"4px 10px", fontSize:11 }} onClick={()=>save(m.id)}>Save</button>
                      <button className="btn btn-ghost" style={{ padding:"4px 10px", fontSize:11 }} onClick={()=>setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" style={{ padding:"4px 10px", fontSize:11 }} onClick={()=>{setEditing(m.id);setEditVal({});}}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminRiders({ token }) {
  const [riders, setRiders] = useState(mockRiders);
  useEffect(() => { apiCall("/api/riders",{},token).then(d=>d&&setRiders(d)); }, []);

  return (
    <div className="fade-up">
      <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:22, marginBottom:20 }}>Riders</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:16 }}>
        {riders.map(r=>(
          <div key={r.id} className="card">
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg,${theme.accent},${theme.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🛵</div>
              <div>
                <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:15 }}>{r.name||r.user_name}</div>
                <div style={{ fontSize:12, color:theme.textMuted }}>{r.vehicle}</div>
              </div>
              <div style={{ marginLeft:"auto" }}>
                <span style={{ fontSize:11, padding:"3px 8px", borderRadius:20, background:r.available?`${theme.accent}22`:`${theme.danger}22`, color:r.available?theme.accent:theme.danger }}>
                  {r.available?"🟢 Online":"🔴 Offline"}
                </span>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, textAlign:"center", background:theme.bgCardAlt, borderRadius:10, padding:12 }}>
              {[["Active",r.active_orders||0,"📦"],["Today",r.today_deliveries||0,"✓"],["Rating","4.8★","⭐"]].map(([label,val,icon])=>(
                <div key={label}>
                  <div style={{ fontSize:16 }}>{icon}</div>
                  <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:16, color:theme.accent }}>{val}</div>
                  <div style={{ fontSize:10, color:theme.textMuted }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDelivery() {
  const routeGroups = [
    { direction:"North (Kiratpur Sahib → Nangal Rd)", orders:["ORX-1042","ORX-1043"], distance:"6.5 km", eta:"18 min", rider:"Arjun Singh" },
    { direction:"South (Gurdwara Chowk → Rupnagar Rd)", orders:["ORX-1044","ORX-1045","ORX-1046"], distance:"10.2 km", eta:"28 min", rider:"Vikram Rao" },
    { direction:"East (Bhakra Canal Side)", orders:["ORX-1047"], distance:"3.2 km", eta:"9 min", rider:"Mohit Dev" },
  ];
  return (
    <div className="fade-up">
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:22 }}>Delivery Route Optimizer</h2>
        <p style={{ fontSize:13, color:theme.textMuted, marginTop:4 }}>Orders grouped by direction to maximize efficiency</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {routeGroups.map((rg,i)=>(
          <div key={i} className="card" style={{ borderColor:i===0?theme.purple+"66":i===1?theme.gold+"66":theme.accentSoft }}>
            <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:13, marginBottom:12, color:i===0?theme.purple:i===1?theme.gold:theme.accent }}>{rg.direction}</div>
            <div style={{ display:"flex", gap:16, marginBottom:12 }}>
              <div><div style={{ fontSize:10, color:theme.textMuted }}>Distance</div><div style={{ fontWeight:600 }}>{rg.distance}</div></div>
              <div><div style={{ fontSize:10, color:theme.textMuted }}>ETA</div><div style={{ fontWeight:600 }}>{rg.eta}</div></div>
              <div><div style={{ fontSize:10, color:theme.textMuted }}>Rider</div><div style={{ fontWeight:600, fontSize:12 }}>{rg.rider}</div></div>
            </div>
            {rg.orders.map(oid=>(
              <div key={oid} style={{ display:"flex", justifyContent:"space-between", padding:"6px 10px", background:theme.bgCardAlt, borderRadius:8, fontSize:12, marginBottom:4 }}>
                <span style={{ fontFamily:"monospace", color:theme.accent }}>{oid}</span>
              </div>
            ))}
            <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${theme.border}`, display:"flex", gap:8 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:8, fontSize:12 }}>Dispatch</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:8, fontSize:12 }}>Optimize</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAnalytics() {
  const topMeds = [
    { name:"Paracetamol 500mg", sales:420, pct:85 },
    { name:"Metformin 500mg",   sales:310, pct:63 },
    { name:"Vitamin C 500mg",   sales:280, pct:57 },
    { name:"Amoxicillin 250mg", sales:240, pct:49 },
    { name:"Ibuprofen 400mg",   sales:210, pct:43 },
  ];
  const hourly = [12,18,24,20,35,42,55,60,48,38,44,50];
  const maxH = Math.max(...hourly);

  return (
    <div className="fade-up">
      <h2 style={{ fontFamily:"Syne", fontWeight:700, fontSize:22, marginBottom:20 }}>Analytics</h2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        <div className="card">
          <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:4 }}>Orders by Hour</div>
          <div style={{ fontSize:12, color:theme.textMuted, marginBottom:16 }}>Today</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:5, height:100 }}>
            {hourly.map((v,i)=>(
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                <div style={{ width:"100%", height:`${(v/maxH)*80}px`, background:i>=8?`linear-gradient(180deg,${theme.accent},${theme.accent}66)`:theme.border, borderRadius:"3px 3px 1px 1px", minHeight:3 }} />
                {i%2===0 && <div style={{ fontSize:9, color:theme.textMuted }}>{i+8}h</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ fontFamily:"Syne", fontWeight:700, marginBottom:4 }}>Top Medicines</div>
          <div style={{ fontSize:12, color:theme.textMuted, marginBottom:16 }}>By sales this month</div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {topMeds.map(m=>(
              <div key={m.name}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13 }}>{m.name}</span>
                  <span style={{ fontSize:12, color:theme.accent, fontWeight:600 }}>{m.sales} units</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width:`${m.pct}%`, background:`linear-gradient(90deg,${theme.accent},${theme.purple})` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
        {[
          { label:"Avg Distance/Order", value:"3.8 km", icon:"📏", color:theme.accent },
          { label:"Fuel Saved (Route)",  value:"22 km",  icon:"⛽", color:theme.gold },
          { label:"On-time Rate",        value:"94%",    icon:"⏱", color:theme.purple },
          { label:"Return Customers",    value:"78%",    icon:"🔄", color:theme.danger },
        ].map(s=>(
          <div key={s.label} className="card-alt" style={{ textAlign:"center", border:`1px solid ${s.color}33` }}>
            <div style={{ fontSize:24, marginBottom:8 }}>{s.icon}</div>
            <div style={{ fontFamily:"Syne", fontWeight:700, fontSize:22, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12, color:theme.textMuted, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem("medirun_user")); } catch { return null; } });
  const [token, setToken] = useState(() => localStorage.getItem("medirun_token") || null);
  const [view,  setView]  = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem("medirun_user"));
      if (u?.role === "admin")  return "admin";
      if (u?.role === "rider")  return "rider";
      if (u?.role === "customer") return "customer";
    } catch {}
    return "landing";
  });

  const login = (u, t) => {
    setUser(u); setToken(t);
    localStorage.setItem("medirun_user", JSON.stringify(u));
    localStorage.setItem("medirun_token", t);
    setView(u.role === "admin" ? "admin" : u.role === "rider" ? "rider" : "customer");
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem("medirun_user");
    localStorage.removeItem("medirun_token");
    setView("landing");
  };

  return (
    <>
      <style>{css}</style>
      {view === "landing"  && <LandingPage  user={user} onNavigate={setView} />}
      {view === "login"    && <AuthScreen   onLogin={login} onBack={()=>setView("landing")} />}
      {view === "customer" && <CustomerDashboard user={user} token={token} onNavigate={setView} onLogout={logout} />}
      {view === "admin"    && <AdminDashboard    user={user} token={token} onNavigate={setView} onLogout={logout} />}
      {view === "rider"    && <RiderApp          user={user} token={token} onNavigate={setView} onLogout={logout} />}
    </>
  );
}
