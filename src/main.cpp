#include <IRremote.hpp>
#include <Arduino.h>

//====== IR pin 腳位 ======
#define IR_RECEIVE_PIN 15 // 接收腳位 (請接紅外線接收器)
#define IR_SEND_PIN 4   // 發射腳位 (請接紅外線 LED)



// 用來存最後接收到的 IR 資料
IRData lastSignal;
bool hasSignal = false;

void setup() {
  Serial.begin(115200);

  // 啟動接收器
  IrReceiver.begin(IR_RECEIVE_PIN, ENABLE_LED_FEEDBACK);
  Serial.println("✅ IR Receiver 準備就緒...");

  // 啟動發射器
  IrSender.begin(IR_SEND_PIN);
  Serial.println("✅ IR Sender 準備就緒...");
}

void loop() {
  // 檢查有沒有接收到紅外線
  if (IrReceiver.decode()) {
    // 存下最後一次訊號
    lastSignal = IrReceiver.decodedIRData;
    hasSignal = true;

    // 印出接收到的訊號
    Serial.print("接收到的資料: 0x");
    Serial.println(lastSignal.decodedRawData, HEX);
    Serial.print("協議: ");
    Serial.println(IrReceiver.getProtocolString());

    IrReceiver.resume(); // 準備接收下一個
  }

  // 如果在序列監控視窗輸入字元
  if (Serial.available()) {
    char cmd = Serial.read();

    if (cmd == 's') { // 按下 s 就發射
      if (hasSignal) {
        Serial.println("📤 發射剛剛接收到的訊號...");

        // ⚡ 這裡要依協議選擇發射方式
        switch (lastSignal.protocol) {
          case NEC:
            IrSender.sendNEC(lastSignal.decodedRawData, lastSignal.numberOfBits);
            break;
          case SONY:
            IrSender.sendSony(lastSignal.decodedRawData, lastSignal.numberOfBits);
            break;
          case RC5:
            IrSender.sendRC5(lastSignal.decodedRawData, lastSignal.numberOfBits);
            break;
          case RC6:
            IrSender.sendRC6(lastSignal.decodedRawData, lastSignal.numberOfBits);
            break;
          default:
            Serial.println("⚠️ 不支援的協議，無法發射");
            break;
        }
      } else {
        Serial.println("❌ 尚未接收到任何訊號");
      }
    }
  }
}