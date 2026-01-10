const plugin = require("../index");

const run = async () => {
  const mode = process.env.MODE || (process.env.BASE_URL ? "real" : "mock");
  const baseURL = process.env.BASE_URL;

  await plugin.updateStrategy({
    mode,
    baseURL,
    timeoutMs: 4000,
    retries: 1,
    retryDelayMs: 200,
  });

  console.log("Online:", await plugin.online());
  console.log("State:", await plugin.state());

  console.log("Status:", await plugin.send({ tool: "device.status", params: {} }));
  console.log("Capture:", await plugin.send({ tool: "camera.capture", params: {} }));

  console.log(
    "Servo:",
    await plugin.send({ tool: "servo.rotate", params: { axis: "pan", dir: "cw", step: 1 } })
  );

  console.log("IR Start:", await plugin.send({ tool: "ir.receive", params: { action: "start" } }));
  console.log("IR Last:", await plugin.send({ tool: "ir.receive", params: { action: "last" } }));

  console.log(
    "IR Send:",
    await plugin.send({ tool: "ir.send", params: { format: "nec", value: 551502255, bits: 32 } })
  );

  console.log("Offline:", await plugin.offline());
};

run().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
