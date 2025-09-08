#include <Arduino.h>
#include <IRrecv.h>
#include <IRutils.h>

const uint16_t RECV_PIN = 15; 

IRrecv irrecv(RECV_PIN);
decode_results results;

void setup() {
  Serial.begin(115200);
  irrecv.enableIRIn(); // 啟動接收器
  Serial.println("開始接收紅外線訊號...");
}

void loop() {
  if (irrecv.decode(&results)) {
    Serial.println(resultToHumanReadableBasic(&results));
    Serial.println(resultToSourceCode(&results));
    irrecv.resume(); // 準備下一次接收
  }
}