let csrf = "";
export function setCsrf(value) {
  csrf = value;
}
export async function api(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(csrf && { "X-CSRF-Token": csrf }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (
        response.status === 401 &&
        location.pathname.startsWith("/admin") &&
        !location.pathname.startsWith("/admin/login")
      )
        location.assign("/admin/login");
      throw Object.assign(
        new Error(
          data.error || "The request could not be completed. Please try again.",
        ),
        { status: response.status },
      );
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(
        "The server took too long to respond. Please try again.",
        { cause: error },
      );
    if (error instanceof TypeError)
      throw new Error(
        "Could not reach the server. Check your connection and try again.",
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
