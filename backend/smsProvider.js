import dotenv from "dotenv";
dotenv.config();

class SMSProvider {
  constructor() {
    this.providerName = process.env.SMS_PROVIDER || "MOCK";
  }

  async sendSMS(to, message) {
    console.log(`=== SMS PROVIDER ===`);
    console.log(`Proveedor: ${this.providerName}`);
    console.log(`Destinatario: ${to}`);
    console.log(`Mensaje: ${message}`);
    console.log(`====================`);
    
    // De-coupled SMS provider integration logic
    switch (this.providerName) {
      case "TWILIO":
        // Future integration:
        // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
        // await client.messages.create({ body: message, to, from: process.env.TWILIO_PHONE });
        break;
      case "VONAGE":
        // Future integration: Vonage/Nexmo
        break;
      case "AWS_SNS":
        // Future integration: AWS Simple Notification Service
        break;
      case "MESSAGEBIRD":
        // Future integration: MessageBird
        break;
      case "MOCK":
      default:
        console.log(`[MOCK SMS] OTP successfully sent to ${to}.`);
        break;
    }
    return { success: true, provider: this.providerName };
  }
}

export const smsProvider = new SMSProvider();
