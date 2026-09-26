// Optional contact fields use the same rules in the browser and on the server.
export function validateContact({ email = "", phone = "" } = {}) {
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
  )
    throw new Error("Enter a valid contact email.");
  if (typeof phone !== "string")
    throw new Error("Enter a valid phone number (7–15 digits).");
  const number = phone.trim();
  const digits = number.replace(/\D/g, "");
  if (
    number.length > 40 ||
    (number &&
      (!/^\+?[0-9().\s-]+$/.test(number) ||
        digits.length < 7 ||
        digits.length > 15))
  )
    throw new Error("Enter a valid phone number (7–15 digits).");
  return { email: email.trim(), phone: number };
}
