// Accounts: log in, sign up and a profile that saves the watchlist and
// favorite view to Supabase. The publishable key is meant to be public;
// row level security limits each user to their own profile row.
(() => {
  const SUPABASE_URL = "https://tufyhrugtpfhaxvgpliw.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KyT4XyF2ku3cjdRl73xVPw_bkBn3hlE";

  const $ = (id) => document.getElementById(id);
  const dialog = $("accountDialog");
  const btn = $("accountBtn");
  if (!window.supabase || !dialog) {
    btn?.remove();
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let user = null;
  let profile = null;
  let mode = "login";

  const say = (text, tone = "") => {
    $("accountMsg").textContent = text;
    $("accountMsg").dataset.tone = tone;
  };

  function setMode(m) {
    mode = m;
    for (const b of document.querySelectorAll(".auth-tabs [data-mode]")) b.setAttribute("aria-selected", b.dataset.mode === m);
    document.querySelector("#authForm .signup-only").hidden = m !== "signup";
    $("authSubmit").textContent = m === "signup" ? "Create account" : "Log in";
    $("forgotBtn").hidden = m === "signup";
    $("authForm").password.autocomplete = m === "signup" ? "new-password" : "current-password";
    say("");
  }

  function renderAccount() {
    $("authView").hidden = !!user;
    $("profileView").hidden = !user;
    btn.textContent = user ? profile?.display_name || "My profile" : "Log in";
    if (!user) return;
    const f = $("profileForm");
    $("profileEmail").textContent = `Signed in as ${user.email}`;
    f.name.value = profile?.display_name ?? "";
    f.view.value = profile?.default_view ?? "crypto";
    const list = profile?.watchlist ?? [];
    $("profileWatchlist").textContent = list.length ? list.join(", ") : "Add tickers to the Owl Scanner and they save here.";
  }

  // Load the user's profile, creating it from what's on screen the first time.
  async function loadProfile() {
    const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) return say(`Could not load your profile: ${error.message}`, "error");
    if (data) {
      profile = data;
      window.owl?.applyProfile({ watchlist: data.watchlist, view: data.default_view });
    } else {
      const fresh = {
        id: user.id,
        display_name: user.user_metadata?.display_name || user.email.split("@")[0],
        watchlist: window.owl?.getWatchlist() ?? [],
        default_view: window.owl?.getView() ?? "crypto",
      };
      const { data: created, error: err } = await sb.from("profiles").insert(fresh).select().single();
      if (err) return say(`Could not create your profile: ${err.message}`, "error");
      profile = created;
    }
    renderAccount();
  }

  async function saveProfile(fields) {
    const { data, error } = await sb
      .from("profiles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .select()
      .single();
    if (error) throw error;
    profile = data;
    renderAccount();
  }

  sb.auth.onAuthStateChange((event, session) => {
    const next = session?.user ?? null;
    const changed = next?.id !== user?.id;
    user = next;
    if (!user) { profile = null; renderAccount(); return; }
    // Defer Supabase calls out of the auth callback, as the client recommends.
    if (changed) setTimeout(loadProfile, 0);
    if (event === "PASSWORD_RECOVERY") {
      renderAccount();
      dialog.showModal();
      $("profileForm").password.focus();
      say("You're signed in from the reset link. Enter a new password and save.", "ok");
    }
  });

  btn.addEventListener("click", () => {
    say("");
    renderAccount();
    dialog.showModal();
  });
  $("accountClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  document.querySelector(".auth-tabs").addEventListener("click", (e) => {
    const m = e.target.closest("[data-mode]")?.dataset.mode;
    if (m) setMode(m);
  });

  $("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const password = f.password.value;
    $("authSubmit").disabled = true;
    say(mode === "signup" ? "Creating your account…" : "Logging in…");
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { data: { display_name: f.name.value.trim() }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) say("Check your email and click the link to confirm your account, then log in.", "ok");
        else say("Account created.", "ok");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        say("Logged in.", "ok");
      }
      f.password.value = "";
    } catch (err) {
      say(err.message, "error");
    } finally {
      $("authSubmit").disabled = false;
    }
  });

  $("forgotBtn").addEventListener("click", async () => {
    const email = $("authForm").email.value.trim();
    if (!email) return say("Enter your email above first.", "error");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    say(error ? error.message : "If that email has an account, a reset link is on its way.", error ? "error" : "ok");
  });

  $("profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.password.value) {
        const { error } = await sb.auth.updateUser({ password: f.password.value });
        if (error) throw error;
        f.password.value = "";
      }
      await saveProfile({ display_name: f.name.value.trim() || null, default_view: f.view.value });
      window.owl?.applyProfile({ view: f.view.value });
      say("Profile saved.", "ok");
    } catch (err) {
      say(`Could not save: ${err.message}`, "error");
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    say("Logged out.", "ok");
  });

  // Keep the saved watchlist in step with the Owl Scanner.
  document.addEventListener("owl:watchlist", async (e) => {
    if (!user || !profile) return;
    try { await saveProfile({ watchlist: e.detail.slice(0, 50) }); } catch {}
  });

  setMode("login");
})();
