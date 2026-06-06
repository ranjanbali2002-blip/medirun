const BASE = import.meta.env.VITE_API_URL || "";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  orders: {
    list: () => get("/api/orders"),
    get: (id) => get(`/api/orders/${id}`),
    updateStatus: (id, status) => patch(`/api/orders/${id}/status`, { status }),
    create: (data) => post("/api/orders", data),
  },
  medicines: {
    list: () => get("/api/medicines"),
  },
  analytics: {
    summary: () => get("/api/analytics/summary"),
    weekly: () => get("/api/analytics/weekly"),
    topMedicines: () => get("/api/analytics/top-medicines"),
  },
  routes: {
    list: () => get("/api/route-groups"),
  },
};
