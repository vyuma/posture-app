import server from "../api/relay";

const port = Number(process.env.POSTURE_RELAY_PORT || 1422);
server.listen(port, "127.0.0.1", () => {
  console.log(`Cloud pairing relay: http://127.0.0.1:${port}`);
});
