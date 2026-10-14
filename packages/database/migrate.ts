import { connect } from "../../apps/api/src/db";
const db = await connect();
await db.end();
