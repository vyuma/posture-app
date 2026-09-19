import { cloudPairingEnvironment } from "../server/pairing/config";
import { createCloudPairingServer } from "../server/pairing/server";

let environment: ReturnType<typeof cloudPairingEnvironment> | undefined;
// Vercel owns the listener; exporting the Node server also handles WebSocket upgrades.
export default createCloudPairingServer(() => environment ??= cloudPairingEnvironment());
