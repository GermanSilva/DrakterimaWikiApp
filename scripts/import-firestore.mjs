// Imports a legacy Firestore JSON export into the Supabase campaign hub. See scripts/import/cli.mjs and --help.
//   npm run db:import -- --input <export.json> --dm-email <email> --app-origin <url>          (dry run)
//   npm run db:import -- --input <export.json> --dm-email <email> --app-origin <url> --apply  (commit)
import { main } from './import/cli.mjs'

process.exitCode = await main(process.argv.slice(2), process.env)
