export function googleMapsLink(address) {
  return typeof address === "string" && address.trim()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`
    : "";
}
