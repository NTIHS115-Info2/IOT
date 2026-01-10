const buildMockStatus = () => ({
  connected: true,
  uptime: 12345,
  temperatureC: 36.5,
  voltageV: 4.95,
  lastError: null,
});

const buildMockIr = () => ({
  format: "nec",
  value: 0x20df10ef,
  bits: 32,
  raw: [9000, 4500, 560, 560, 560, 1690],
  receivedAt: new Date().toISOString(),
});

const buildMockImage = () => ({
  mime: "image/jpeg",
  imageBase64: "BASE64_MOCK_IMAGE_DATA",
  capturedAt: new Date().toISOString(),
});

module.exports = {
  buildMockStatus,
  buildMockIr,
  buildMockImage,
};
