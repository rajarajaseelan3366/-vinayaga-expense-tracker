/* =========================================================
   Vinayaga Construction — Expense Tracker
   Supabase backend layer (replaces localStorage)
   Tables: et_projects, et_payments, et_expenses
   ========================================================= */

const SUPABASE_URL = "https://ywdgzeqpwotoutwbqupr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__O1otg8XstnZ54lEfNeVIg_RZyNOUEi";

window.VCDB = (() => {
  let _client = null;

  function client() {
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("Supabase library failed to load. Check your internet connection and refresh.");
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  function check(error) {
    if (error) throw new Error(error.message || "Database request failed");
  }

  // The app collects local date-times ("YYYY-MM-DDTHH:mm"). Convert to a
  // timezone-aware ISO string so timestamptz stores the exact moment and
  // rendering back in local time shows what the user picked.
  function toIso(dateStr) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function mapProject(row) {
    return {
      id: row.id,
      name: row.name,
      clientName: row.client_name,
      contractAmount: Number(row.contract_amount) || 0,
      payments: (row.et_payments || []).map((p) => ({
        id: p.id,
        amount: Number(p.amount) || 0,
        date: p.date,
      })),
      expenses: (row.et_expenses || []).map((e) => ({
        id: e.id,
        amount: Number(e.amount) || 0,
        date: e.date,
        category: e.category,
        note: e.note || "",
      })),
    };
  }

  /* ---------- Read ---------- */
  async function loadAll() {
    const { data, error } = await client()
      .from("et_projects")
      .select("*, et_payments(*), et_expenses(*)")
      .order("created_at", { ascending: true });
    check(error);
    return (data || []).map(mapProject);
  }

  /* ---------- Projects ---------- */
  async function insertProject(p) {
    const { data, error } = await client()
      .from("et_projects")
      .insert({
        name: p.name,
        client_name: p.clientName,
        contract_amount: p.contractAmount,
      })
      .select()
      .single();
    check(error);
    return mapProject({ ...data, et_payments: [], et_expenses: [] });
  }

  async function updateProject(id, p) {
    const { error } = await client()
      .from("et_projects")
      .update({
        name: p.name,
        client_name: p.clientName,
        contract_amount: p.contractAmount,
      })
      .eq("id", id);
    check(error);
  }

  async function deleteProject(id) {
    const { error } = await client().from("et_projects").delete().eq("id", id);
    check(error);
  }

  /* ---------- Payments ---------- */
  async function insertPayment(projectId, pay) {
    const { data, error } = await client()
      .from("et_payments")
      .insert({ project_id: projectId, amount: pay.amount, date: toIso(pay.date) })
      .select()
      .single();
    check(error);
    return { id: data.id, amount: Number(data.amount) || 0, date: data.date };
  }

  async function updatePayment(id, pay) {
    const { error } = await client()
      .from("et_payments")
      .update({ amount: pay.amount, date: toIso(pay.date) })
      .eq("id", id);
    check(error);
  }

  async function deletePayment(id) {
    const { error } = await client().from("et_payments").delete().eq("id", id);
    check(error);
  }

  /* ---------- Expenses ---------- */
  async function insertExpense(projectId, ex) {
    const { data, error } = await client()
      .from("et_expenses")
      .insert({
        project_id: projectId,
        amount: ex.amount,
        date: toIso(ex.date),
        category: ex.category,
        note: ex.note || "",
      })
      .select()
      .single();
    check(error);
    return {
      id: data.id,
      amount: Number(data.amount) || 0,
      date: data.date,
      category: data.category,
      note: data.note || "",
    };
  }

  async function updateExpense(id, ex) {
    const { error } = await client()
      .from("et_expenses")
      .update({
        amount: ex.amount,
        date: toIso(ex.date),
        category: ex.category,
        note: ex.note || "",
      })
      .eq("id", id);
    check(error);
  }

  async function deleteExpense(id) {
    const { error } = await client().from("et_expenses").delete().eq("id", id);
    check(error);
  }

  return {
    loadAll,
    insertProject,
    updateProject,
    deleteProject,
    insertPayment,
    updatePayment,
    deletePayment,
    insertExpense,
    updateExpense,
    deleteExpense,
  };
})();
