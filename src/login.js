import "./admin/admin.css";
import "./chat.css";
import { api } from "./api.js";

const { config } = await api("/api/salon");
const root = document.querySelector("#app");
root.innerHTML = `<main class="login-layout"><a class="login-back" href="/">← Return to the salon</a><section class="panel login-panel" aria-labelledby="login-title"><p class="eyebrow">THE STUDIO MANAGER</p><h1 id="login-title">A little care, behind the scenes.</h1><p id="salon-login-name"></p><form id="login-form"><div class="field"><label for="email">Admin email</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="username"></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required maxlength="256" autocomplete="current-password"></div><p class="form-error" id="login-error" role="alert"></p><button class="btn" type="submit">Sign in to the dashboard</button></form><p class="login-help">Access is limited to authorized salon administrators. There is no public admin sign-up. Contact the salon owner if you need access.</p></section></main>`;
document.querySelector("#salon-login-name").textContent =
  `${config.name} · Authorized administrators only`;
document.title = `${config.name} · Admin Login`;
const form = document.querySelector("#login-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const error = document.querySelector("#login-error");
  button.disabled = true;
  button.textContent = "Signing in…";
  error.textContent = "";
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: Object.fromEntries(new FormData(form)),
    });
    location.assign("/admin/");
  } catch (failure) {
    error.textContent = failure.message;
    button.disabled = false;
    button.textContent = "Sign in to the dashboard";
  }
});
