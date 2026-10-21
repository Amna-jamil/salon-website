import { api } from "../api.js";

export function mountAdminAccounts(root) {
  root.innerHTML = `<div class="page-heading"><div><p class="eyebrow">SUPERADMIN WORKSPACE</p><h1>Your salon team.</h1><p>Create a private admin login for someone you trust to manage the salon.</p></div></div>
    <div class="accounts-layout"><section class="panel settings-panel" aria-labelledby="add-admin-title"><h2 id="add-admin-title">Add Admin</h2><p>Admins can manage services, prices, gallery, locations, appointments and website chat. Website Settings stay with the superadmin.</p>
    <form id="add-admin-form"><div class="fields-grid">
      <div class="field field-wide"><label for="admin-account-email">Admin email</label><input id="admin-account-email" name="email" type="email" autocomplete="off" required maxlength="254"></div>
      <div class="field field-wide"><label for="admin-account-password">Password</label><input id="admin-account-password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="256" aria-describedby="admin-password-help"><small id="admin-password-help">Use 12–256 characters. Share the login details privately with the new admin.</small></div>
      <div class="field field-wide"><label for="admin-account-confirm">Confirm password</label><input id="admin-account-confirm" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256"></div>
    </div><p class="form-error" role="alert"></p><p class="account-success" role="status"></p><button class="btn" type="submit">Create admin account</button></form></section>
    <section class="panel settings-panel" aria-labelledby="admin-list-title"><div class="panel-heading"><h2 id="admin-list-title">Admin accounts</h2><button class="btn btn-secondary" type="button" id="reload-accounts">Refresh</button></div><p id="accounts-feedback" role="status"></p><ul class="accounts-list" aria-label="Authorized administrators"></ul><p>New admins sign in at <a href="/admin/login">Admin Login</a>. Creating an account does not send an email.</p></section></div>`;
  const form = root.querySelector("form");
  const error = form.querySelector(".form-error");
  const success = form.querySelector(".account-success");
  const feedback = root.querySelector("#accounts-feedback");
  const refresh = root.querySelector("#reload-accounts");
  const list = root.querySelector(".accounts-list");
  let saving = false;
  function addAccount(account, prepend = false) {
    if ([...list.children].some((item) => item.dataset.id === account.id))
      return;
    const row = document.createElement("li");
    row.dataset.id = account.id;
    const email = document.createElement("strong");
    email.textContent = account.email;
    const role = document.createElement("span");
    role.textContent = account.role === "superadmin" ? "Superadmin" : "Admin";
    row.append(email, role);
    if (prepend) list.prepend(row);
    else list.append(row);
  }
  async function load() {
    refresh.disabled = true;
    feedback.textContent = "Loading admin accounts…";
    list.setAttribute("aria-busy", "true");
    try {
      const { accounts } = await api("/api/admin/accounts");
      list.replaceChildren();
      accounts.forEach((account) => addAccount(account));
      feedback.textContent = accounts.length
        ? ""
        : "No admin accounts to display.";
      refresh.textContent = "Refresh";
    } catch (failure) {
      feedback.textContent = failure.message;
      refresh.textContent = "Retry loading";
    } finally {
      refresh.disabled = false;
      list.setAttribute("aria-busy", "false");
    }
  }
  refresh.addEventListener("click", load);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving) return;
    error.textContent = "";
    success.textContent = "";
    const values = Object.fromEntries(new FormData(form));
    if (
      !values.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
    ) {
      error.textContent = "Enter a valid admin email address.";
      return;
    }
    if (values.password.length < 12 || values.password.length > 256) {
      error.textContent = "Use a password between 12 and 256 characters.";
      return;
    }
    if (values.password !== values.confirmPassword) {
      error.textContent = "The passwords do not match.";
      return;
    }
    saving = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "Creating admin…";
    form.setAttribute("aria-busy", "true");
    try {
      const { user } = await api("/api/admin/accounts", {
        method: "POST",
        body: { email: values.email.trim(), password: values.password },
      });
      form.reset();
      addAccount(user, true);
      success.textContent = `Admin account created for ${user.email}. They can now sign in at Admin Login. No email has been sent.`;
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      saving = false;
      button.disabled = false;
      button.textContent = "Create admin account";
      form.setAttribute("aria-busy", "false");
    }
  });
  return load();
}
