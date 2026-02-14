/** Generate mock appointment availability for the next few business days. */
export function getMockAvailability(
  urgency: "routine" | "soon" | "urgent",
  count = 3
): { start: string; end: string }[] {
  const now = new Date();
  const slots: { start: string; end: string }[] = [];

  let dayOffset: number;
  if (urgency === "urgent") dayOffset = 0;
  else if (urgency === "soon") dayOffset = 1;
  else dayOffset = 3;

  const hours = [9, 11, 14, 10, 13, 15];

  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset + Math.floor(i / 3));
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(hours[i % hours.length], 0, 0, 0);

    const end = new Date(d);
    end.setMinutes(30);

    slots.push({
      start: d.toISOString(),
      end: end.toISOString(),
    });
  }

  return slots;
}
