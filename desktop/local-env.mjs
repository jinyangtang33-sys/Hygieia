// Only included in the standalone build, never imported by the hosted Worker.
export const env = {};
export function configureLocalDatabase(db) { env.DB = db; }
