import { z } from 'zod';
const primary=z.object({primary:z.boolean().optional()}).optional();
const personSchema=z.object({genders:z.array(z.object({value:z.string().optional(),metadata:primary})).optional(),birthdays:z.array(z.object({date:z.object({year:z.number().int().optional(),month:z.number().int().optional(),day:z.number().int().optional()}).optional(),metadata:primary})).optional(),addresses:z.array(z.object({type:z.string().optional(),countryCode:z.string().optional()})).optional()});
export function analysisProfile(input: unknown, now = new Date()) {
  const parsed=personSchema.safeParse(input),person=parsed.success?parsed.data:{};
  const genders = person.genders ?? [], gender = genders.find(v => v.metadata?.primary)?.value ?? (genders.length === 1 ? genders[0].value : undefined);
  const birthdays = person.birthdays ?? [], birth = (birthdays.find(v => v.metadata?.primary) ?? (birthdays.length === 1 ? birthdays[0] : undefined))?.date;
  let ageYears: number | null = null;
  if (birth?.year && birth.month && birth.day) {
    const actual = new Date(Date.UTC(birth.year, birth.month - 1, birth.day));
    const valid = actual.getUTCFullYear() === birth.year && actual.getUTCMonth() === birth.month - 1 && actual.getUTCDate() === birth.day;
    const age = now.getUTCFullYear() - birth.year - (now.getUTCMonth() + 1 < birth.month || (now.getUTCMonth() + 1 === birth.month && now.getUTCDate() < birth.day) ? 1 : 0);
    if (valid && age >= 0 && age <= 120) ageYears = age;
  }
  const homes = (person.addresses ?? []).filter(a => a.type?.toLowerCase() === 'home');
  const countries = [...new Set(homes.map(a => a.countryCode?.toUpperCase()).filter((v): v is string => !!v && /^[A-Z]{2}$/.test(v)))];
  return { gender: gender && gender.length <= 80 ? gender : null, ageYears,
    residenceCountry: homes.length > 0 && homes.every(h => /^[A-Za-z]{2}$/.test(h.countryCode??'')) && countries.length === 1 ? countries[0] : null,
    nationality: null, observedAt: now.toISOString(), source: 'google_people_profile' as const };
}
