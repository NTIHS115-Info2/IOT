const plugin = require("../index");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForConnection = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await plugin.send({ tool: "device.status", params: {} });
    if (result.ok) {
      return true;
    }
    if (result.code !== "ETIMEDOUT" && result.code !== "EQUEUEFULL") {
      return true;
    }
    await delay(500);
  }
  return false;
};

const run = async () => {
  await plugin.updateStrategy({
    mode: process.env.MODE || "real",
    wsHost: process.env.WS_HOST || "0.0.0.0",
    wsPort: Number(process.env.WS_PORT || 8080),
    timeoutMs: 1000,
    retries: 0,
    retryDelayMs: 200,
    queueLimit: 50,
  });

  console.log("Online:", await plugin.online({ wsPort: 8080 }));
  console.log("等待 ESP32 連線...");

  const connected = await waitForConnection(10000);
  if (!connected) {
    console.log("10 秒內未連線，結束測試。");
    await plugin.offline();
    process.exit(1);
  }

  console.log("Status:", await plugin.send({ tool: "device.status", params: {} }));
  console.log(
    "Servo:",
    await plugin.send({ tool: "servo.rotate", params: { axis: "pan", dir: "cw", step: 1 } })
  );
  console.log("IR Last:", await plugin.send({ tool: "ir.receive", params: { action: "last" } }));

  console.log("Offline:", await plugin.offline());
};

run().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
