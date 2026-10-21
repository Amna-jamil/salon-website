import "./fonts.css";
import "./shell.css";

const root =
  document.querySelector("#admin-app") || document.querySelector("#app");
root.innerHTML =
  '<div class="application-loading" role="status">Loading the salon…</div>';
async function start() {
  try {
    if (/^\/admin\/login\/?$/.test(location.pathname))
      await import("./login.js");
    else if (location.pathname.startsWith("/admin"))
      await import("./admin/admin.js");
    else await import("./main.js");
  } catch (error) {
    root.innerHTML =
      '<div class="application-loading"><h1>We couldn’t load this page.</h1><p id="load-error"></p><button type="button" id="retry-load">Try again</button><a href="/">Return to the salon</a></div>';
    root.querySelector("#load-error").textContent = error.message;
    root
      .querySelector("#retry-load")
      .addEventListener("click", () => location.reload());
  }
}
await start();
