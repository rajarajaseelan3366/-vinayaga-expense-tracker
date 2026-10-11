/* =========================================================
   Vinayaga Construction — Expense Tracker
   Plain JS, Supabase persistence (see backend.js)
   ========================================================= */
const CATEGORIES = [
  "Steel",
  "Cement",
  "Bricks (Cengal)",
  "Labour Salary",
  "Sand",
  "Transport",
  "Other",
];

// Category colors for chart & badges
const CATEGORY_COLORS = {
  Steel: "#f43f5e",
  Cement: "#3b82f6",
  "Bricks (Cengal)": "#f97316",
  "Labour Salary": "#8b5cf6",
  Sand: "#eab308",
  Transport: "#10b981",
  Other: "#64748b",
};

// Shorter labels for chart legend / read-only display
const CATEGORY_LABELS = {
  Steel: "Steel",
  Cement: "Cement",
  "Bricks (Cengal)": "Bricks",
  "Labour Salary": "Labour Salary",
  Sand: "Sand",
  Transport: "Transport",
  Other: "Other",
};

/* ---------- State ---------- */
let projects = [];
let currentProjectId = null;
let categoryChart = null;
let activeModal = null; // { mode, type, id }

/* ---------- Loading overlay & DB error handling ---------- */
function showLoading() {
  document.getElementById("loadingOverlay").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.add("hidden");
}

function dbErrorToast(e) {
  console.error(e);
  toast(e.message || "Couldn't reach the database. Try again.");
}

/* ---------- Formatting ---------- */
function formatCurrency(n) {
  const num = Number(n) || 0;
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function nowDateTimeStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Make any stored date value (ISO with timezone) compatible with a
// datetime-local input, shown in the viewer's local time.
function toDateTimeLocalValue(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime()))
    return dateStr.includes("T") ? dateStr : dateStr + "T00:00";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- Computations ---------- */
function projectPaid(project) {
  return project.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

function projectSpent(project) {
  return project.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function projectBalance(project) {
  return (Number(project.contractAmount) || 0) - projectPaid(project);
}

function getAllExpenses() {
  const all = [];
  for (const p of projects) {
    for (const e of p.expenses) {
      all.push({ ...e, projectId: p.id });
    }
  }
  return all;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
}

/* ---------- Render: Dashboard ---------- */
function renderDashboard() {
  const totalAmount = projects.reduce(
    (s, p) => s + (Number(p.contractAmount) || 0),
    0
  );

  // Cash in hand = total client payments - total expenses, across all projects
  let totalPaid = 0;
  let totalSpent = 0;
  for (const p of projects) {
    totalPaid += projectPaid(p);
    totalSpent += projectSpent(p);
  }
  const inHand = totalPaid - totalSpent;

  document.getElementById("statProjects").textContent = projects.length;
  document.getElementById("statTotalAmount").textContent =
    formatCurrency(totalAmount);

  const inHandEl = document.getElementById("statInHand");
  inHandEl.textContent = formatCurrency(inHand);
  inHandEl.style.color = inHand >= 0 ? "var(--emerald)" : "var(--rose)";

  document.getElementById("projectCount").textContent =
    projects.length + (projects.length === 1 ? " project" : " projects");

  renderHistory();
  renderProjectCards();
  renderCategoryChart();
}

function renderProjectCards() {
  const grid = document.getElementById("projectsGrid");
  const empty = document.getElementById("emptyProjects");

  if (projects.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = projects
    .map((p) => {
      const paid = projectPaid(p);
      const contract = Number(p.contractAmount) || 0;
      const pct = contract > 0 ? Math.min(100, (paid / contract) * 100) : 0;
      return `
        <div class="project-card" data-id="${p.id}">
          <h3>${esc(p.name)}</h3>
          <p class="project-client">${esc(p.clientName)}</p>
          <div class="project-card-amount">${formatCurrency(contract)}</div>
          <div class="project-progress">
            <div class="project-progress-bar">
              <div class="project-progress-fill" style="width:${pct.toFixed(1)}%"></div>
            </div>
            <div class="project-meta">
              <span>Paid: ${formatCurrency(paid)}</span>
              <span>${pct.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll(".project-card").forEach((card) => {
    card.addEventListener("click", () =>
      openProject(card.getAttribute("data-id"))
    );
  });
}

function renderCategoryChart() {
  const ctx = document.getElementById("categoryChart").getContext("2d");

  // aggregate by category
  const totals = {};
  CATEGORIES.forEach((c) => (totals[c] = 0));
  for (const e of getAllExpenses()) {
    if (totals[e.category] !== undefined) {
      totals[e.category] += Number(e.amount) || 0;
    }
  }

  const labels = CATEGORIES.map((c) => CATEGORY_LABELS[c] || c);
  const data = CATEGORIES.map((c) => totals[c]);
  const colors = CATEGORIES.map((c) => CATEGORY_COLORS[c]);

  if (categoryChart) {
    categoryChart.data.datasets[0].data = data;
    categoryChart.update();
    return;
  }

  Chart.defaults.color = "#94a3b8";
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";

  categoryChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderColor: "rgba(20, 27, 46, 0.9)",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            padding: 14,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 13, weight: "500" },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 21, 36, 0.95)",
          borderColor: "#243049",
          borderWidth: 1,
          padding: 12,
          titleFont: { weight: "600" },
          callbacks: {
            label: (ctx) =>
              ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

/* ---------- Render: History ---------- */
function getAllTransactions() {
  const txns = [];
  for (const p of projects) {
    for (const pay of p.payments) {
      txns.push({
        id: pay.id,
        type: "income",
        amount: pay.amount,
        date: pay.date,
        projectId: p.id,
        projectName: p.name,
      });
    }
    for (const ex of p.expenses) {
      txns.push({
        id: ex.id,
        type: "expense",
        amount: ex.amount,
        date: ex.date,
        category: ex.category,
        note: ex.note,
        projectId: p.id,
        projectName: p.name,
      });
    }
  }
  // newest first
  txns.sort((a, b) => new Date(b.date) - new Date(a.date));
  return txns;
}

/* ---------- History list toggle ---------- */
document.getElementById("historyToggle").addEventListener("click", () => {
  document.getElementById("historyCard").classList.toggle("hidden");
  document.getElementById("historyToggle").classList.toggle("collapsed");
});

function renderHistory() {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("emptyHistory");
  const countEl = document.getElementById("historyCount");
  const txns = getAllTransactions();

  countEl.textContent =
    txns.length + (txns.length === 1 ? " transaction" : " transactions");

  if (txns.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const upArrow =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
  const downArrow =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  list.innerHTML = txns
    .map((t) => {
      const isIncome = t.type === "income";
      const color = isIncome ? "var(--emerald)" : "var(--rose)";
      const sign = isIncome ? "+" : "-";
      return `
        <div class="history-row" data-id="${t.type}-${t.id}">
          <div class="history-left">
            <div class="history-icon ${t.type}">${
              isIncome ? upArrow : downArrow
            }</div>
            <div class="history-info">
              <div class="history-project">${esc(t.projectName)}</div>
              <div class="history-datetime">${esc(formatDateTime(t.date))}</div>
            </div>
          </div>
          <div class="history-amount" style="color:${color}">${sign}${formatCurrency(
            t.amount
          )}</div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".history-row").forEach((row, i) => {
    row.addEventListener("click", () => showTransactionDetail(txns[i]));
  });
}

function showTransactionDetail(t) {
  const body = document.getElementById("txnBody");
  const isIncome = t.type === "income";
  const typeLabel = isIncome ? "Income" : "Expense";
  const typeColor = isIncome ? "var(--emerald)" : "var(--rose)";
  const sign = isIncome ? "+" : "-";

  let rows = `
    <div class="detail-row">
      <span class="detail-label">Project</span>
      <span class="detail-value">${esc(t.projectName)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Type</span>
      <span class="detail-value" style="color:${typeColor};font-weight:600">${typeLabel}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Amount</span>
      <span class="detail-value" style="color:${typeColor};font-weight:700">${sign}${formatCurrency(
        t.amount
      )}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Date &amp; Time</span>
      <span class="detail-value">${esc(formatDateTime(t.date))}</span>
    </div>
  `;

  if (!isIncome) {
    rows += `
      <div class="detail-row">
        <span class="detail-label">Category</span>
        <span class="detail-value">${esc(t.category)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Spent on</span>
        <span class="detail-value">${
          t.note ? esc(t.note) : '<span class="muted">—</span>'
        }</span>
      </div>
    `;
  }

  body.innerHTML = rows;
  document.getElementById("txnOverlay").classList.remove("hidden");
}

function hideTxnDetail() {
  document.getElementById("txnOverlay").classList.add("hidden");
}

document.getElementById("txnClose").addEventListener("click", hideTxnDetail);
document.getElementById("txnOk").addEventListener("click", hideTxnDetail);
document.getElementById("txnOverlay").addEventListener("click", (e) => {
  if (e.target.id === "txnOverlay") hideTxnDetail();
});

/* ---------- Render: Project Detail ---------- */
function openProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  currentProjectId = id;

  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("projectView").classList.remove("hidden");
  document.getElementById("backBtn").classList.remove("hidden");

  document.getElementById("detailProjectName").textContent = p.name;
  document.getElementById("detailClientName").textContent = p.clientName;
  document.getElementById("detailContract").textContent = formatCurrency(
    p.contractAmount
  );

  renderProjectDetail();
  window.scrollTo(0, 0);
}

function renderProjectDetail() {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;

  const paid = projectPaid(p);
  const spent = projectSpent(p);
  const balance = projectBalance(p);

  document.getElementById("detailPaid").textContent = formatCurrency(paid);
  document.getElementById("detailSpent").textContent = formatCurrency(spent);
  document.getElementById("detailBalance").textContent = formatCurrency(balance);

  const balEl = document.getElementById("detailBalance");
  balEl.style.color = balance >= 0 ? "var(--accent)" : "var(--rose)";

  renderPayments(p);
  renderExpenses(p);
}

function renderPayments(project) {
  const list = document.getElementById("paymentsList");
  const empty = document.getElementById("emptyPayments");

  if (project.payments.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const sorted = [...project.payments].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  list.innerHTML = sorted
    .map(
      (pay) => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-top">
            <span class="list-item-amount" style="color:var(--emerald)">${formatCurrency(
              pay.amount
            )}</span>
          </div>
          <div class="list-item-bottom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(pay.date)}
          </div>
        </div>
        <div class="list-item-actions">
          <button class="icon-btn" data-action="edit-payment" data-id="${pay.id}" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn" data-action="delete-payment" data-id="${pay.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

function renderExpenses(project) {
  const list = document.getElementById("expensesList");
  const empty = document.getElementById("emptyExpenses");

  if (project.expenses.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const sorted = [...project.expenses].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  list.innerHTML = sorted
    .map(
      (ex) => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-top">
            <span class="list-item-amount" style="color:var(--rose)">${formatCurrency(
              ex.amount
            )}</span>
            <span class="badge badge-cat" style="background:${hexToRgba(
              CATEGORY_COLORS[ex.category] || "#64748b",
              0.18
            )};color:${CATEGORY_COLORS[ex.category] || "#94a3b8"}">${esc(
        ex.category
      )}</span>
          </div>
          <div class="list-item-bottom">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(ex.date)}
          </div>
          ${ex.note ? `<div class="list-item-note">${esc(ex.note)}</div>` : ""}
        </div>
        <div class="list-item-actions">
          <button class="icon-btn" data-action="edit-expense" data-id="${ex.id}" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn" data-action="delete-expense" data-id="${ex.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

/* ---------- Escape HTML ---------- */
function esc(str) {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- Modal ---------- */
function openModal({ title, fields, values, onSave }) {
  activeModal = { onSave };
  document.getElementById("modalTitle").textContent = title;

  const form = document.getElementById("modalForm");
  form.innerHTML = fields
    .map((f) => {
      const val = values?.[f.name] ?? f.default ?? "";
      let control = "";
      if (f.type === "select") {
        control = `<select name="${f.name}" ${f.required ? "required" : ""}>
          ${f.options
            .map(
              (o) =>
                `<option value="${esc(o)}" ${
                  o === val ? "selected" : ""
                }>${esc(o)}</option>`
            )
            .join("")}
        </select>`;
      } else if (f.type === "textarea") {
        control = `<textarea name="${f.name}" ${
          f.required ? "required" : ""
        }>${esc(val)}</textarea>`;
      } else {
        control = `<input type="${f.type || "text"}" name="${f.name}" value="${esc(
          val
        )}" ${f.required ? "required" : ""} step="0.01" min="0" />`;
      }
      return `<div class="field">
        <label>${f.label}</label>
        ${control}
      </div>`;
    })
    .join("");

  document.getElementById("modalOverlay").classList.remove("hidden");
  // focus first input
  setTimeout(() => {
    const first = form.querySelector("input, select, textarea");
    if (first) first.focus();
  }, 50);
}

function closeModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
  activeModal = null;
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalCancel").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

document.getElementById("modalSave").addEventListener("click", (e) => {
  e.preventDefault();
  const form = document.getElementById("modalForm");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const data = {};
  new FormData(form).forEach((v, k) => (data[k] = v));
  if (activeModal?.onSave) activeModal.onSave(data);
  closeModal();
});

document.getElementById("modalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("modalSave").click();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!document.getElementById("modalOverlay").classList.contains("hidden"))
      closeModal();
    if (
      !document.getElementById("confirmOverlay").classList.contains("hidden")
    )
      hideConfirm();
    if (!document.getElementById("txnOverlay").classList.contains("hidden"))
      hideTxnDetail();
  }
});

/* ---------- Confirm dialog ---------- */
let confirmCallback = null;
function showConfirm({ title, message, onOk }) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent =
    message || "This action cannot be undone.";
  confirmCallback = onOk;
  document.getElementById("confirmOverlay").classList.remove("hidden");
}

function hideConfirm() {
  document.getElementById("confirmOverlay").classList.add("hidden");
  confirmCallback = null;
}

document.getElementById("confirmCancel").addEventListener("click", hideConfirm);
document.getElementById("confirmOk").addEventListener("click", () => {
  if (confirmCallback) confirmCallback();
  hideConfirm();
});
document.getElementById("confirmOverlay").addEventListener("click", (e) => {
  if (e.target.id === "confirmOverlay") hideConfirm();
});

/* ---------- Project CRUD ---------- */
document.getElementById("addProjectBtn").addEventListener("click", () => {
  openModal({
    title: "Add Project",
    fields: [
      { name: "name", label: "Project Name", required: true },
      { name: "clientName", label: "Client Name", required: true },
      {
        name: "contractAmount",
        label: "Total Contract Amount (₹)",
        type: "number",
        required: true,
        default: 0,
      },
    ],
    onSave: async (data) => {
      try {
        const project = await VCDB.insertProject({
          name: data.name.trim(),
          clientName: data.clientName.trim(),
          contractAmount: parseFloat(data.contractAmount) || 0,
        });
        projects.push(project);
        renderDashboard();
        toast("Project created");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
});

document.getElementById("editProjectBtn").addEventListener("click", () => {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;
  openModal({
    title: "Edit Project",
    fields: [
      { name: "name", label: "Project Name", required: true },
      { name: "clientName", label: "Client Name", required: true },
      {
        name: "contractAmount",
        label: "Total Contract Amount (₹)",
        type: "number",
        required: true,
      },
    ],
    values: {
      name: p.name,
      clientName: p.clientName,
      contractAmount: p.contractAmount,
    },
    onSave: async (data) => {
      try {
        await VCDB.updateProject(p.id, {
          name: data.name.trim(),
          clientName: data.clientName.trim(),
          contractAmount: parseFloat(data.contractAmount) || 0,
        });
        p.name = data.name.trim();
        p.clientName = data.clientName.trim();
        p.contractAmount = parseFloat(data.contractAmount) || 0;
        renderProjectDetail();
        document.getElementById("detailProjectName").textContent = p.name;
        document.getElementById("detailClientName").textContent = p.clientName;
        toast("Project updated");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
});

document.getElementById("deleteProjectBtn").addEventListener("click", () => {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;
  showConfirm({
    title: `Delete "${p.name}"?`,
    message:
      "All payments and expenses for this project will be permanently deleted.",
    onOk: async () => {
      try {
        await VCDB.deleteProject(currentProjectId);
        projects = projects.filter((x) => x.id !== currentProjectId);
        goToDashboard();
        toast("Project deleted");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
});

/* ---------- Payment CRUD ---------- */
document.getElementById("addPaymentBtn").addEventListener("click", () => {
  openModal({
    title: "Add Payment",
    fields: [
      {
        name: "amount",
        label: "Amount (₹)",
        type: "number",
        required: true,
        default: 0,
      },
      {
        name: "date",
        label: "Date & Time",
        type: "datetime-local",
        required: true,
        default: nowDateTimeStr(),
      },
    ],
    onSave: async (data) => {
      const p = projects.find((x) => x.id === currentProjectId);
      if (!p) return;
      try {
        const payment = await VCDB.insertPayment(currentProjectId, {
          amount: parseFloat(data.amount) || 0,
          date: data.date,
        });
        p.payments.push(payment);
        renderProjectDetail();
        renderDashboard();
        toast("Payment added");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
});

function editPayment(id) {
  const p = projects.find((x) => x.id === currentProjectId);
  const pay = p?.payments.find((x) => x.id === id);
  if (!pay) return;
  openModal({
    title: "Edit Payment",
    fields: [
      { name: "amount", label: "Amount (₹)", type: "number", required: true },
      {
        name: "date",
        label: "Date & Time",
        type: "datetime-local",
        required: true,
      },
    ],
    values: { amount: pay.amount, date: toDateTimeLocalValue(pay.date) },
    onSave: async (data) => {
      try {
        await VCDB.updatePayment(pay.id, {
          amount: parseFloat(data.amount) || 0,
          date: data.date,
        });
        pay.amount = parseFloat(data.amount) || 0;
        pay.date = new Date(data.date).toISOString();
        renderProjectDetail();
        renderDashboard();
        toast("Payment updated");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
}

function deletePayment(id) {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;
  showConfirm({
    title: "Delete this payment?",
    onOk: async () => {
      try {
        await VCDB.deletePayment(id);
        p.payments = p.payments.filter((x) => x.id !== id);
        renderProjectDetail();
        renderDashboard();
        toast("Payment deleted");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
}

/* ---------- Expense CRUD ---------- */
document.getElementById("addExpenseBtn").addEventListener("click", () => {
  openModal({
    title: "Add Expense",
    fields: [
      {
        name: "amount",
        label: "Amount (₹)",
        type: "number",
        required: true,
        default: 0,
      },
      {
        name: "date",
        label: "Date & Time",
        type: "datetime-local",
        required: true,
        default: nowDateTimeStr(),
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: CATEGORIES,
        required: true,
      },
      { name: "note", label: "Note", type: "textarea" },
    ],
    onSave: async (data) => {
      const p = projects.find((x) => x.id === currentProjectId);
      if (!p) return;
      try {
        const expense = await VCDB.insertExpense(currentProjectId, {
          amount: parseFloat(data.amount) || 0,
          date: data.date,
          category: data.category,
          note: data.note?.trim() || "",
        });
        p.expenses.push(expense);
        renderProjectDetail();
        renderDashboard();
        toast("Expense added");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
});

function editExpense(id) {
  const p = projects.find((x) => x.id === currentProjectId);
  const ex = p?.expenses.find((x) => x.id === id);
  if (!ex) return;
  openModal({
    title: "Edit Expense",
    fields: [
      { name: "amount", label: "Amount (₹)", type: "number", required: true },
      {
        name: "date",
        label: "Date & Time",
        type: "datetime-local",
        required: true,
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        options: CATEGORIES,
        required: true,
      },
      { name: "note", label: "Note", type: "textarea" },
    ],
    values: {
      amount: ex.amount,
      date: toDateTimeLocalValue(ex.date),
      category: ex.category,
      note: ex.note,
    },
    onSave: async (data) => {
      try {
        await VCDB.updateExpense(ex.id, {
          amount: parseFloat(data.amount) || 0,
          date: data.date,
          category: data.category,
          note: data.note?.trim() || "",
        });
        ex.amount = parseFloat(data.amount) || 0;
        ex.date = new Date(data.date).toISOString();
        ex.category = data.category;
        ex.note = data.note?.trim() || "";
        renderProjectDetail();
        renderDashboard();
        toast("Expense updated");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
}

function deleteExpense(id) {
  const p = projects.find((x) => x.id === currentProjectId);
  if (!p) return;
  showConfirm({
    title: "Delete this expense?",
    onOk: async () => {
      try {
        await VCDB.deleteExpense(id);
        p.expenses = p.expenses.filter((x) => x.id !== id);
        renderProjectDetail();
        renderDashboard();
        toast("Expense deleted");
      } catch (e) {
        dbErrorToast(e);
      }
    },
  });
}

/* ---------- List action delegation ---------- */
document.getElementById("paymentsList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  if (btn.getAttribute("data-action") === "edit-payment") editPayment(id);
  else if (btn.getAttribute("data-action") === "delete-payment") deletePayment(id);
});

document.getElementById("expensesList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  if (btn.getAttribute("data-action") === "edit-expense") editExpense(id);
  else if (btn.getAttribute("data-action") === "delete-expense") deleteExpense(id);
});

/* ---------- Navigation ---------- */
function goToDashboard() {
  currentProjectId = null;
  document.getElementById("projectView").classList.add("hidden");
  document.getElementById("dashboardView").classList.remove("hidden");
  document.getElementById("backBtn").classList.add("hidden");
  renderDashboard();
}

document.getElementById("backBtn").addEventListener("click", goToDashboard);

/* ---------- Init ---------- */
(async function init() {
  showLoading();
  try {
    projects = await VCDB.loadAll();
  } catch (e) {
    console.error(e);
    toast("Couldn't load data. Check your connection, then refresh.");
  }
  hideLoading();
  renderDashboard();
})();
