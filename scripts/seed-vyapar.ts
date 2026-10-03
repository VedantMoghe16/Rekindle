import { db } from "../src/lib/db";
import { seedVyapar } from "../prisma/vyapar-seed";

seedVyapar().then((r) => console.log(`Vyapar AI seeded: ${r.merchants} merchants, ${r.deals} deals`)).finally(() => db.$disconnect());
