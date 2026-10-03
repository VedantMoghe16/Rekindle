import { db } from "../src/lib/db";
import { resetDemo } from "../src/lib/services/demo";

resetDemo().then((lanes) => console.log(`Demo reset: ${lanes.revive} Revive / ${lanes.warm} Warm / ${lanes.watch} Watch`)).finally(() => db.$disconnect());
