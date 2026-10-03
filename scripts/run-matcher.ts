import { db } from "../src/lib/db";
import { runMatcher, upsertComputedSignals } from "../src/lib/services/matcher";

export { runMatcher };

if (import.meta.url === `file://${process.argv[1]}`) {
  upsertComputedSignals().then(() => runMatcher()).then((changes) => console.log(`Matcher done, ${changes.length} lane changes.`)).finally(() => db.$disconnect());
}
