export function localDateTime(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function validateBooking(
  values,
  salon,
  now = localDateTime(salon.timeZone),
) {
  const errors = {};
  if (!values.name?.trim()) errors.name = "Please enter your name.";
  const digits = (values.phone || "").replace(/\D/g, "");
  if (
    !/^[+()\d\s.-]+$/.test(values.phone || "") ||
    digits.length < 7 ||
    digits.length > 15
  )
    errors.phone = "Enter a phone number with 7–15 digits.";
  if (
    !salon.services.some((category) =>
      category.items.some((item) => item.id === values.service),
    )
  )
    errors.service = "Please choose a service.";
  if (!salon.branches.some((branch) => branch.id === values.branch))
    errors.branch = "Please choose a studio.";
  const validDate =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.datetime || "") &&
    Number.isFinite(Date.parse(values.datetime));
  if (!validDate || values.datetime <= now)
    errors.datetime = "Choose a future date and time in the salon’s timezone.";
  return errors;
}

export function whatsappLink(salon, values) {
  const number = salon.contact.whatsappNumber.replace(/\D/g, "");
  if (!number) return "";
  let message = `${salon.booking.whatsappGreeting} ${salon.name}.`;
  if (values) {
    const service = salon.services
      .flatMap((category) => category.items)
      .find((item) => item.id === values.service);
    const branch = salon.branches.find((item) => item.id === values.branch);
    message += `\nName: ${values.name.trim()}\nPhone: ${values.phone.trim()}\nService: ${service.name}\nStudio: ${branch.name}\nPreferred date & time: ${values.datetime.replace("T", " ")} (${salon.timeZone})\nPlease let me know your availability. Thank you!`;
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
