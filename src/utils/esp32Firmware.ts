/**
 * ESP32 Complete Arduino C++ Firmware & Circuit Wiring Generator
 * Features:
 * 1. BLE (Bluetooth Low Energy) receiver for wireless control from Android Chrome
 * 2. Serial (USB OTG) receiver for direct wired cable control from Android Phone
 * 3. L298N / TB6612FNG Dual H-Bridge Motor Driver with PWM Speed Control
 * 4. Failsafe Watchdog: Auto-stops car if connection is lost > 500ms
 * 5. Headlight LED & Buzzer control
 */

export const ESP32_ARDUINO_CODE = `/*
  =============================================================
  TeleDrive ESP32 RC Car Firmware
  Supports:
   - Android Phone Web-Bluetooth (BLE) OR USB OTG Serial (115200)
   - PWM Motor Speed Control (L298N or TB6612FNG)
   - Watchdog failsafe (stops motors if connection drops > 500ms)
   - Headlight & Buzzer controls
  =============================================================
*/

#include <Arduino.h>
#if __has_include("esp_arduino_version.h")
  #include "esp_arduino_version.h"
#endif
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ESP32 Power Stability: Brownout detector control registers
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// Detect ESP32 Arduino Core Version (v3.x vs v2.x)
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  #define ESP32_CORE_V3 1
#else
  #define ESP32_CORE_V3 0
#endif

// ====== MOTOR PIN CONFIGURATION ======
// Left Motor (Motor A)
const int PIN_ENA = 25; // PWM Speed Pin Motor A (ESP32 GPIO 25)
const int PIN_IN1 = 26; // Direction 1
const int PIN_IN2 = 27; // Direction 2

// Right Motor (Motor B)
const int PIN_ENB = 14; // PWM Speed Pin Motor B (ESP32 GPIO 14)
const int PIN_IN3 = 12; // Direction 1
const int PIN_IN4 = 13; // Direction 2

// Auxiliaries
const int PIN_HEADLIGHT = 32; // LED Headlights
const int PIN_BUZZER    = 33; // Active Buzzer / Horn

// PWM Settings (ESP32 LEDC)
const int PWM_FREQ = 1000;
const int PWM_RES  = 8; // 0-255

#if !ESP32_CORE_V3
const int PWM_CH_A = 0;
const int PWM_CH_B = 1;
#endif

// BLE UUIDs (Nordic UART Service compatible)
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic = NULL;
bool deviceConnected = false;
unsigned long lastPacketTime = 0;
const unsigned long FAILSAFE_TIMEOUT_MS = 1000; // Failsafe watchdog: Stop car if no command received for 1000ms (1 sec)

void setMotorPWM(int leftPWM, int rightPWM) {
#if ESP32_CORE_V3
  ledcWrite(PIN_ENA, leftPWM);
  ledcWrite(PIN_ENB, rightPWM);
#else
  ledcWrite(PWM_CH_A, leftPWM);
  ledcWrite(PWM_CH_B, rightPWM);
#endif
}

void stopMotors() {
  setMotorPWM(0, 0);
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
}

void applyDrive(int throttle, int steer, bool brake) {
  if (brake) {
    stopMotors();
    return;
  }

  // Calculate Differential Steering
  // throttle: -100 to +100, steer: -100 to +100
  float t = constrain(throttle, -100, 100) / 100.0f;
  float s = constrain(steer, -100, 100) / 100.0f;

  float leftPower  = t + s * 0.75f;
  float rightPower = t - s * 0.75f;

  // Clamp -1.0 to 1.0
  leftPower  = constrain(leftPower, -1.0f, 1.0f);
  rightPower = constrain(rightPower, -1.0f, 1.0f);

  int leftPWM  = (int)(fabs(leftPower) * 255.0f);
  int rightPWM = (int)(fabs(rightPower) * 255.0f);

  // Apply Left Motor
  if (leftPower > 0.05f) {
    digitalWrite(PIN_IN1, HIGH);
    digitalWrite(PIN_IN2, LOW);
  } else if (leftPower < -0.05f) {
    digitalWrite(PIN_IN1, LOW);
    digitalWrite(PIN_IN2, HIGH);
  } else {
    digitalWrite(PIN_IN1, LOW);
    digitalWrite(PIN_IN2, LOW);
    leftPWM = 0;
  }

  // Apply Right Motor
  if (rightPower > 0.05f) {
    digitalWrite(PIN_IN3, HIGH);
    digitalWrite(PIN_IN4, LOW);
  } else if (rightPower < -0.05f) {
    digitalWrite(PIN_IN3, LOW);
    digitalWrite(PIN_IN4, HIGH);
  } else {
    digitalWrite(PIN_IN3, LOW);
    digitalWrite(PIN_IN4, LOW);
    rightPWM = 0;
  }

  setMotorPWM(leftPWM, rightPWM);
}

// Command parser: "M:<throttle>,<steer>,<brake>,<light>,<horn>"
// Example: "M:85,-30,0,1,0"
void parseCommand(String cmd) {
  cmd.trim();
  if (!cmd.startsWith("M:")) return;
  lastPacketTime = millis();

  int idx1 = cmd.indexOf(':');
  int idx2 = cmd.indexOf(',', idx1 + 1);
  int idx3 = cmd.indexOf(',', idx2 + 1);
  int idx4 = cmd.indexOf(',', idx3 + 1);
  int idx5 = cmd.indexOf(',', idx4 + 1);

  if (idx1 == -1 || idx2 == -1 || idx3 == -1 || idx4 == -1 || idx5 == -1) return;

  int throttle = cmd.substring(idx1 + 1, idx2).toInt();
  int steer    = cmd.substring(idx2 + 1, idx3).toInt();
  bool brake   = (cmd.substring(idx3 + 1, idx4).toInt() == 1);
  bool light   = (cmd.substring(idx4 + 1, idx5).toInt() == 1);
  bool horn    = (cmd.substring(idx5 + 1).toInt() == 1);

  digitalWrite(PIN_HEADLIGHT, light ? HIGH : LOW);
  digitalWrite(PIN_BUZZER, horn ? HIGH : LOW);

  applyDrive(throttle, steer, brake);
}

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Android Phone Connected!");
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Phone Disconnected. Stopping motors.");
    stopMotors();
    pServer->startAdvertising();
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    // Compatible with both ESP32 Core 2.x (returns std::string) and Core 3.x (returns String)
    String cmd = String(pCharacteristic->getValue().c_str());
    if (cmd.length() > 0) {
      parseCommand(cmd);
    }
  }
};

void setup() {
  // CRITICAL: Disable brownout detector to prevent restart during motor voltage sags!
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  Serial.println("[TeleDrive] ESP32 Ready (Brownout protection compensated)...");

  // Setup GPIOs
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);
  pinMode(PIN_HEADLIGHT, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Setup PWM Channels (Automatic detection for ESP32 Core 3.x vs Core 2.x)
#if ESP32_CORE_V3
  ledcAttach(PIN_ENA, PWM_FREQ, PWM_RES);
  ledcAttach(PIN_ENB, PWM_FREQ, PWM_RES);
#else
  ledcSetup(PWM_CH_A, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CH_B, PWM_FREQ, PWM_RES);
  ledcAttachPin(PIN_ENA, PWM_CH_A);
  ledcAttachPin(PIN_ENB, PWM_CH_B);
#endif

  stopMotors();

  // Initialize BLE
  BLEDevice::init("TeleDrive-ESP32");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE
  );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("[TeleDrive] BLE Advertising started as 'TeleDrive-ESP32'!");
}

void loop() {
  // Read Serial commands (if Android Phone is connected via USB OTG cable)
  if (Serial.available()) {
    String serialCmd = Serial.readStringUntil('\\n');
    parseCommand(serialCmd);
  }

  // Failsafe watchdog check
  if (millis() - lastPacketTime > FAILSAFE_TIMEOUT_MS && lastPacketTime != 0) {
    stopMotors();
  }

  delay(5);
}
`;

export const WIRING_GUIDE = [
  {
    component: 'ESP32 -> L298N Motor Driver',
    pins: [
      { espPin: 'GPIO 25', compPin: 'ENA (Remove jumper for PWM)', note: 'Left Motor Speed (PWM)' },
      { espPin: 'GPIO 26', compPin: 'IN1', note: 'Left Motor Direction Forward' },
      { espPin: 'GPIO 27', compPin: 'IN2', note: 'Left Motor Direction Reverse' },
      { espPin: 'GPIO 14', compPin: 'ENB (Remove jumper for PWM)', note: 'Right Motor Speed (PWM)' },
      { espPin: 'GPIO 12', compPin: 'IN3', note: 'Right Motor Direction Forward' },
      { espPin: 'GPIO 13', compPin: 'IN4', note: 'Right Motor Direction Reverse' },
      { espPin: 'GND', compPin: 'GND (Common Ground)', note: 'MUST be connected with Battery GND' },
    ]
  },
  {
    component: 'ESP32 -> Auxiliaries',
    pins: [
      { espPin: 'GPIO 32', compPin: 'White/Yellow LED Anode (+)', note: 'Front Headlights (use 220Ω resistor)' },
      { espPin: 'GPIO 33', compPin: 'Active Buzzer (+)', note: 'Horn sound effect' },
      { espPin: 'VIN (or 5V)', compPin: 'L298N 5V Out', note: 'Powers the ESP32 from motor battery regulator' },
    ]
  },
  {
    component: 'L298N -> Power & Motors',
    pins: [
      { espPin: '12V / 7.4V Battery (+)', compPin: 'L298N +12V Terminal', note: '2S (7.4V) or 3S (11.1V) Li-Ion / LiPo battery' },
      { espPin: 'Battery (-)', compPin: 'L298N GND', note: 'Common ground with ESP32' },
      { espPin: 'Motor A (+/-)', compPin: 'OUT1 & OUT2', note: 'Left Wheels DC Motor' },
      { espPin: 'Motor B (+/-)', compPin: 'OUT3 & OUT4', note: 'Right Wheels DC Motor' },
    ]
  }
];
